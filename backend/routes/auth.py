import os
import re
import secrets
import smtplib
from email.mime.text import MIMEText
from flask import Blueprint, request, jsonify
import bcrypt
import psycopg
from psycopg.rows import dict_row
import requests
from config.db import get_db_connection
from google.cloud import storage
from flask_jwt_extended import jwt_required, get_jwt_identity

# 1. ALWAYS initialize the Blueprint first!
auth_bp = Blueprint('auth', __name__)

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
IITK_EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+[0-9]{2}@iitk\.ac\.in$', re.IGNORECASE)
CHESS_USERNAME_REGEX = re.compile(r'^[a-zA-Z0-9_-]{1,50}$')
MAX_OTP_ATTEMPTS = 5


def verify_otp(cursor, email, provided_otp):
    """Verify an unexpired OTP while atomically enforcing a small guess budget."""
    cursor.execute(
        "SELECT otp, attempts FROM pending_otps WHERE email = %s "
        "AND created_at >= NOW() - INTERVAL '15 minutes' FOR UPDATE",
        (email,),
    )
    record = cursor.fetchone()
    if not record or record[1] >= MAX_OTP_ATTEMPTS:
        return False
    if not secrets.compare_digest(str(record[0]), str(provided_otp)):
        cursor.execute("UPDATE pending_otps SET attempts = attempts + 1 WHERE email = %s", (email,))
        return False
    return True

def is_valid_password(password):
    return (
        isinstance(password, str)
        and len(password) >= 8
        and bool(re.search(r'[a-z]', password))
        and bool(re.search(r'[A-Z]', password))
        and bool(re.search(r'[^A-Za-z0-9]', password))
    )

# --- HELPER FUNCTIONS ---

def send_custom_email(receiver_email, subject, body):
    """Generic helper function to handle securely emailing IITK students via SMTP"""
    sender_email = os.environ.get("EMAIL_SENDER")
    sender_password = os.environ.get("EMAIL_PASSWORD")
    
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = sender_email
    msg['To'] = receiver_email

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(sender_email, sender_password)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Email Dispatch Failure: {e}")
        return False


# --- SIGNUP / OTP ROUTES ---

@auth_bp.route('/send-otp', methods=['POST'])
def generate_otp():
    data = request.get_json(silent=True) or {}
    primary_email = (data.get('email') or '').strip()
    secondary_email = (data.get('secondary_email') or '').strip()
    chess_username = (data.get('chess_username') or '').strip()

    if not primary_email or not IITK_EMAIL_REGEX.match(primary_email):
        return jsonify({"error": "You must use a valid @iitk.ac.in email address with your 2-digit year identifier (e.g. username25@iitk.ac.in)."}), 400

    if not secondary_email or not EMAIL_REGEX.match(secondary_email):
        return jsonify({"error": "A valid secondary recovery email address is required."}), 400

    if secondary_email.lower().endswith('@iitk.ac.in') and not IITK_EMAIL_REGEX.match(secondary_email):
        return jsonify({"error": "Secondary IITK email must contain your 2-digit year identifier before @iitk.ac.in (e.g. username25@iitk.ac.in)."}), 400

    if primary_email.lower() == secondary_email.lower():
        return jsonify({"error": "Secondary email must be different from your primary IITK email."}), 400

    if not chess_username or not CHESS_USERNAME_REGEX.match(chess_username):
        return jsonify({"error": "A valid Chess.com ID is required (alphanumeric, hyphens and underscores only)."}), 400

    # 1. Validate Chess.com Username existence BEFORE sending OTP
    headers = {"User-Agent": "ChessClubIITK-Signup-App/1.0 (Contact: chessclub@iitk.ac.in)"}
    chess_api_url = f"https://api.chess.com/pub/player/{chess_username.lower()}"
    
    try:
        chess_response = requests.get(chess_api_url, headers=headers, timeout=5)
        if chess_response.status_code == 404:
            return jsonify({"error": f"Chess.com ID '{chess_username}' does not exist. Please enter a valid Chess.com username."}), 400
        elif chess_response.status_code != 200:
            return jsonify({"error": "Could not verify Chess.com ID right now. Please try again."}), 502
    except requests.exceptions.RequestException:
        return jsonify({"error": "Failed to connect to Chess.com servers for ID verification."}), 502

    primary_otp = f"{secrets.randbelow(900000) + 100000}"
    secondary_otp = f"{secrets.randbelow(900000) + 100000}"

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM pending_otps WHERE email = %s AND created_at >= NOW() - INTERVAL '60 seconds'",
                (primary_email,)
            )
            if cursor.fetchone():
                return jsonify({"error": "Please wait before requesting another verification code."}), 429

            # Check if primary email, secondary email, or chess_username already exists
            cursor.execute(
                "SELECT id, email, chess_username, secondary_email FROM users WHERE LOWER(email) = LOWER(%s) OR LOWER(chess_username) = LOWER(%s) OR LOWER(email) = LOWER(%s) OR LOWER(secondary_email) = LOWER(%s) OR LOWER(secondary_email) = LOWER(%s)",
                (primary_email, chess_username, secondary_email, primary_email, secondary_email)
            )
            existing_user = cursor.fetchone()
            if existing_user:
                if existing_user[1] and existing_user[1].lower() == primary_email.lower():
                    return jsonify({"error": "This IITK email is already registered."}), 409
                elif existing_user[2] and existing_user[2].lower() == chess_username.lower():
                    return jsonify({"error": f"Chess.com ID '{chess_username}' is already linked to an existing account."}), 409
                else:
                    return jsonify({"error": "The specified primary or secondary email is already linked to an account."}), 409

            # Save/Renew temporary OTP record
            sql = """
                INSERT INTO pending_otps (email, otp) 
                VALUES (%s, %s) 
                ON CONFLICT (email) DO UPDATE SET otp = EXCLUDED.otp, created_at = CURRENT_TIMESTAMP, attempts = 0
            """
            cursor.execute(sql, (primary_email, primary_otp))
            cursor.execute(sql, (secondary_email, secondary_otp))
            connection.commit()

        email_body_1 = f"Welcome to the Community!\n\nYour verification code is: {primary_otp}\n\nUse this to complete your registration."
        email_body_2 = f"Welcome to the Community!\n\nYour verification code is: {secondary_otp}\n\nUse this to complete your registration."
        primary_sent = send_custom_email(primary_email, 'Chess Club IITK - Verification Code', email_body_1)
        secondary_sent = send_custom_email(secondary_email, 'Chess Club IITK - Verification Code', email_body_2)
        if primary_sent and secondary_sent:
            return jsonify({"message": "OTPs sent successfully!"}), 200
        else:
            return jsonify({"error": "Failed to send email. Try again."}), 500

    except Exception as e:
        print(f"OTP Generation Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()


@auth_bp.route('/verify-register', methods=['POST'])
def verify_and_register():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    secondary_email = (data.get('secondary_email') or '').strip()
    primary_user_otp = str(data.get('primary_otp') or '').strip()
    secondary_user_otp = str(data.get('secondary_otp') or '').strip()
    password = data.get('password') or ''
    chess_username = (data.get('chess_username') or '').strip()
    name = (data.get('name') or '').strip()
    roll_no = (data.get('rollNo') or data.get('roll_no') or '').strip()
    contact = (data.get('contact') or '').strip()
    gender = (data.get('gender') or '').strip()

    if not all([email, secondary_email, primary_user_otp, secondary_user_otp, password, chess_username, name, roll_no, contact, gender]):
        return jsonify({"error": "All fields are required."}), 400

    if not IITK_EMAIL_REGEX.match(email):
        return jsonify({"error": "You must use a valid @iitk.ac.in email address."}), 400

    if not EMAIL_REGEX.match(secondary_email):
        return jsonify({"error": "A valid secondary recovery email address is required."}), 400

    if secondary_email.lower().endswith('@iitk.ac.in') and not IITK_EMAIL_REGEX.match(secondary_email):
        return jsonify({"error": "Secondary IITK email must contain your 2-digit year identifier before @iitk.ac.in."}), 400

    if email.lower() == secondary_email.lower():
        return jsonify({"error": "Secondary email must be different from your primary IITK email."}), 400

    if not CHESS_USERNAME_REGEX.match(chess_username):
        return jsonify({"error": "Invalid Chess.com ID format."}), 400

    # 0. Validate password strength constraints
    if not is_valid_password(password):
        return jsonify({"error": "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one special character."}), 400

    # 1. Validate Chess.com Username existence
    headers = {"User-Agent": "ChessClubIITK-Signup-App/1.0 (Contact: your_email@iitk.ac.in)"}
    chess_api_url = f"https://api.chess.com/pub/player/{chess_username.lower()}"
    
    try:
        chess_response = requests.get(chess_api_url, headers=headers, timeout=5)
        if chess_response.status_code == 404:
            return jsonify({"error": f"Chess.com ID '{chess_username}' does not exist."}), 400
        elif chess_response.status_code != 200:
            return jsonify({"error": "Could not verify Chess.com ID right now."}), 502
    except requests.exceptions.RequestException:
        return jsonify({"error": "Failed to connect to verification server."}), 502

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # Check duplicate account before committing
            cursor.execute(
                "SELECT id FROM users WHERE LOWER(email) = LOWER(%s) OR LOWER(chess_username) = LOWER(%s) OR LOWER(secondary_email) = LOWER(%s)",
                (email, chess_username, secondary_email)
            )
            if cursor.fetchone():
                return jsonify({"error": "An account with this email, secondary email, or Chess.com ID already exists."}), 409

            # 2. Confirm OTP matches database and has not expired (valid for 15 minutes)
            if not verify_otp(cursor, email, primary_user_otp):
                return jsonify({"error": "Invalid or expired primary email confirmation OTP."}), 401
            
            if not verify_otp(cursor, secondary_email, secondary_user_otp):
                return jsonify({"error": "Invalid or expired secondary email confirmation OTP."}), 401

            # 3. Hash secret credentials safely
            salt = bcrypt.gensalt()
            password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
            
            cursor.execute(
                "INSERT INTO users (email, chess_username, password_hash, name, roll_no, contact, secondary_email, gender) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (email, chess_username, password_hash, name, roll_no, contact, secondary_email, gender)
            )
            
            # 4. Clean up transient database entries
            cursor.execute("DELETE FROM pending_otps WHERE email IN (%s, %s)", (email, secondary_email))
            connection.commit()
            
            return jsonify({"message": "Account created successfully!"}), 201

    except Exception as e:
        print(f"Registration Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()





# --- FORGOT / RESET PASSWORD ROUTES ---

@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()

    if not email or not EMAIL_REGEX.match(email):
        return jsonify({"error": "A valid email address is required."}), 400

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # 1. Check if the user exists
            cursor.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(%s) OR LOWER(secondary_email) = LOWER(%s)", (email, email))
            account_exists = cursor.fetchone() is not None

            # Rate limit check on OTP requests
            cursor.execute(
                "SELECT 1 FROM pending_otps WHERE email = %s AND created_at >= NOW() - INTERVAL '60 seconds'",
                (email,)
            )
            if cursor.fetchone():
                return jsonify({"message": "If an account exists, a recovery code has been sent."}), 200

            # 2. Generate and save cryptographically secure OTP
            otp = f"{secrets.randbelow(900000) + 100000}"
            if not account_exists:
                return jsonify({"message": "If an account exists, a recovery code has been sent."}), 200

            sql = """
                INSERT INTO pending_otps (email, otp) VALUES (%s, %s)
                ON CONFLICT (email) DO UPDATE SET otp = EXCLUDED.otp, created_at = CURRENT_TIMESTAMP, attempts = 0
            """
            cursor.execute(sql, (email, otp))
            connection.commit()

        # 3. Send using generic email helper
        body = f"Forgot your password? Use this recovery code to reset it: {otp}\n\nIf you didn't request this, ignore it."
        if send_custom_email(email, "Chess Club IITK - Password Recovery", body):
            return jsonify({"message": "If an account exists, a recovery code has been sent."}), 200
        else:
            return jsonify({"error": "Failed to send email. Try again."}), 500

    except Exception as e:
        print(f"Forgot Password Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    user_otp = str(data.get('otp') or '').strip()
    new_password = data.get('new_password') or ''

    if not all([email, user_otp, new_password]):
        return jsonify({"error": "All fields are required."}), 400

    if not is_valid_password(new_password):
        return jsonify({"error": "Password must be at least 8 characters long and contain uppercase, lowercase, and special characters."}), 400

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # Confirm recovery code matches token on file and has not expired (valid for 15 minutes)
            if not verify_otp(cursor, email, user_otp):
                return jsonify({"error": "Invalid or expired recovery token."}), 401

            # Hash replacement password
            salt = bcrypt.gensalt()
            password_hash = bcrypt.hashpw(new_password.encode('utf-8'), salt).decode('utf-8')

            # Update master system values (by primary email or secondary email)
            cursor.execute("UPDATE users SET password_hash = %s, token_version = token_version + 1 WHERE LOWER(email) = LOWER(%s) OR LOWER(secondary_email) = LOWER(%s)", (password_hash, email, email))
            cursor.execute("DELETE FROM pending_otps WHERE email = %s", (email,))
            connection.commit()

            return jsonify({"message": "Password updated successfully!"}), 200

    except Exception as e:
        print(f"Reset Password Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()

@auth_bp.route('/user/profile/<email>', methods=['GET'])
@jwt_required()
def get_user_profile(email):
    # Extract true identity from jwt
    current_authenticated_user = get_jwt_identity() or ''
    email_clean = (email or '').strip()
    # Cross-reference them
    if current_authenticated_user.lower() != email_clean.lower():
        return jsonify({"error": "Unauthorized cross-profile read blocked"}), 403

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor(row_factory=dict_row) as cursor:
            sql = "SELECT name, roll_no AS rollNo, contact, email, chess_username AS chesscom, avatar, secondary_email FROM users WHERE LOWER(email) = LOWER(%s) OR LOWER(secondary_email) = LOWER(%s)"
            cursor.execute(sql, (email_clean, email_clean))
            profile = cursor.fetchone()

            if not profile:
                return jsonify({"error": "Profile records not found."}), 404

            return jsonify(profile), 200

    except Exception as e:
        print(f"Profile Retrieval Failure: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()


@auth_bp.route('/user/profile/send-secondary-otp', methods=['POST'])
@jwt_required()
def send_secondary_otp():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    new_secondary_email = (data.get('secondary_email') or '').strip()

    if not email or not new_secondary_email:
        return jsonify({"error": "Primary and secondary email are required."}), 400

    current_authenticated_user = get_jwt_identity() or ''
    if current_authenticated_user.lower() != email.lower():
        return jsonify({"error": "Unauthorized"}), 403

    if email.lower() == new_secondary_email.lower():
        return jsonify({"error": "Secondary email must be different from your primary email."}), 400

    if not EMAIL_REGEX.match(new_secondary_email):
        return jsonify({"error": "A valid secondary email address is required."}), 400

    if new_secondary_email.lower().endswith('@iitk.ac.in') and not IITK_EMAIL_REGEX.match(new_secondary_email):
        return jsonify({"error": "Secondary IITK email must contain your 2-digit year identifier before @iitk.ac.in (e.g. username25@iitk.ac.in)."}), 400

    otp = f"{secrets.randbelow(900000) + 100000}"
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # Check if new secondary email is already taken by another user
            cursor.execute(
                "SELECT id FROM users WHERE (LOWER(email) = LOWER(%s) OR LOWER(secondary_email) = LOWER(%s)) AND LOWER(email) != LOWER(%s)",
                (new_secondary_email, new_secondary_email, email)
            )
            if cursor.fetchone():
                return jsonify({"error": "This secondary email is already linked to another account."}), 409

            # Rate limit check on OTP requests
            cursor.execute(
                "SELECT 1 FROM pending_otps WHERE email = %s AND created_at >= NOW() - INTERVAL '60 seconds'",
                (new_secondary_email,)
            )
            if cursor.fetchone():
                return jsonify({"error": "Please wait before requesting another verification code."}), 429

            # Save OTP
            sql = """
                INSERT INTO pending_otps (email, otp) VALUES (%s, %s)
                ON CONFLICT (email) DO UPDATE SET otp = EXCLUDED.otp, created_at = CURRENT_TIMESTAMP, attempts = 0
            """
            cursor.execute(sql, (new_secondary_email, otp))
            connection.commit()

        body = f"Use this verification code to confirm your new secondary recovery email: {otp}\n\nIf you didn't request this change, please ignore this email."
        if send_custom_email(new_secondary_email, "Chess Club IITK - Secondary Email Verification", body):
            return jsonify({"message": "Verification code sent to your new secondary email!"}), 200
        else:
            return jsonify({"error": "Failed to send verification email. Please try again."}), 500
    except Exception as e:
        print(f"Send Secondary OTP Failure: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()


@auth_bp.route('/user/profile/update', methods=['PUT'])
@jwt_required()
def update_user_profile():
    """Applies modified user identity details to the persistent database layer, verifying secondary email update if modified"""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    name = (data.get('name') or '').strip()
    roll_no = (data.get('rollNo') or data.get('roll_no') or '').strip()
    contact = (data.get('contact') or '').strip()
    avatar = data.get('avatar')
    new_secondary_email = (data.get('secondary_email') or '').strip()
    otp = str(data.get('otp') or '').strip()

    # Security check: Email is our tracking identifier; it cannot be missing
    if not email:
        return jsonify({"error": "Tracking identity string is missing."}), 400

    current_authenticated_user = get_jwt_identity() or ''
    if current_authenticated_user.lower() != email.lower():
        return jsonify({"error": "Unauthorized cross-profile modifications blocked"}), 403

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor(row_factory=dict_row) as cursor:
            # Get current user profile details
            cursor.execute("SELECT secondary_email FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
            user_record = cursor.fetchone()
            if not user_record:
                return jsonify({"error": "User not found."}), 404
            
            current_secondary = user_record.get('secondary_email') or ''

            # If secondary email is being changed
            if new_secondary_email and new_secondary_email.lower() != current_secondary.lower():
                cleaned_sec = new_secondary_email
                if cleaned_sec.lower() == email.lower():
                    return jsonify({"error": "Secondary email must be different from your primary email."}), 400

                if not EMAIL_REGEX.match(cleaned_sec):
                    return jsonify({"error": "A valid secondary email address is required."}), 400

                # Validate IITK email if it is one
                if cleaned_sec.lower().endswith('@iitk.ac.in') and not IITK_EMAIL_REGEX.match(cleaned_sec):
                    return jsonify({"error": "Secondary IITK email must contain your 2-digit year identifier before @iitk.ac.in."}), 400

                # Check uniqueness against other users
                cursor.execute(
                    "SELECT id FROM users WHERE (LOWER(email) = LOWER(%s) OR LOWER(secondary_email) = LOWER(%s)) AND LOWER(email) != LOWER(%s)",
                    (cleaned_sec, cleaned_sec, email)
                )
                if cursor.fetchone():
                    return jsonify({"error": "This secondary email is already in use by another account."}), 409

                if not otp:
                    return jsonify({"error": "OTP_REQUIRED", "message": "Verification code required to update secondary email."}), 400

                # Verify OTP (valid for 15 minutes)
                if not verify_otp(cursor, cleaned_sec, otp):
                    return jsonify({"error": "Invalid or expired OTP."}), 401
                
                # Delete OTP
                cursor.execute("DELETE FROM pending_otps WHERE email = %s", (cleaned_sec,))
                
                # Update with secondary email
                sql = """
                    UPDATE users 
                    SET name = %s, roll_no = %s, contact = %s, avatar = %s, secondary_email = %s
                    WHERE LOWER(email) = LOWER(%s)
                """
                cursor.execute(sql, (name, roll_no, contact, avatar, cleaned_sec, email))
            else:
                # Update without secondary email
                sql = """
                    UPDATE users 
                    SET name = %s, roll_no = %s, contact = %s, avatar = %s 
                    WHERE LOWER(email) = LOWER(%s)
                """
                cursor.execute(sql, (name, roll_no, contact, avatar, email))

            connection.commit()
            return jsonify({"message": "Profile metrics synced successfully!"}), 200

    except Exception as e:
        print(f"Profile Update Failure: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()

# --- DELETE REQUEST ---
@auth_bp.route('/user/profile/delete', methods=['DELETE'])
@jwt_required()
def delete_user_account():
    """Verifies user password and purges their account profile permanently from the database"""
    data = request.get_json(silent=True) or {}
    password = data.get('password') or ''
    email = (data.get('email') or '').strip()

    if not password or not email:
        return jsonify({"error": "Password and identity verification strings are required."}), 400

    # Safety Guard: Ensure the user is deleting their OWN account, not someone else's
    current_authenticated_user = get_jwt_identity() or ''
    if current_authenticated_user.lower() != email.lower():
        return jsonify({"error": "Unauthorized cross-profile deletion attack blocked."}), 403

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # 1. Fetch the user's password hash from the database
            cursor.execute("SELECT password_hash FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
            user_record = cursor.fetchone()

            if not user_record:
                return jsonify({"error": "Account records not found."}), 404

            # 2. Check if the input password matches the stored hash
            if not bcrypt.checkpw(password.encode('utf-8'), user_record[0].encode('utf-8')):
                return jsonify({"error": "Incorrect password. Deletion aborted."}), 401

            # 3. Purge the user from the users master data grid
            cursor.execute("DELETE FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
            
            # (Optional) Clean up any dangling pending OTP records for this email
            cursor.execute("DELETE FROM pending_otps WHERE LOWER(email) = LOWER(%s)", (email,))
            
            connection.commit()
            return jsonify({"message": "Account purged successfully."}), 200

    except Exception as e:
        print(f"Critical Account Deletion Error: {e}")
        return jsonify({"error": "Internal server error during account erasure."}), 500
    finally:
        if connection:
            connection.close()

# --- LEAGUE OF LEGENDS 6.0 EVENT REGISTRATION ---

@auth_bp.route('/register-lol', methods=['POST'])
@jwt_required()
def register_lol():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    name = (data.get('name') or '').strip()
    roll_no = (data.get('roll_no') or data.get('rollNo') or '').strip()
    chess_username = (data.get('chess_username') or '').strip()
    contact = (data.get('contact') or '').strip()
    secondary_email = (data.get('secondary_email') or '').strip()

    if not all([email, name, roll_no, chess_username, contact]):
        return jsonify({"error": "All fields are required."}), 400

    current_user_email = get_jwt_identity() or ''
    if current_user_email.lower() != email.lower():
        return jsonify({"error": "Unauthorized registration identity mismatch."}), 403

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # 1. Prevent registration if the event date has already passed
            cursor.execute("SELECT event_date, event_end_date FROM events WHERE title ILIKE '%league of legends%' ORDER BY event_date DESC LIMIT 1;")
            row = cursor.fetchone()
            if row:
                from datetime import date
                event_date = row[0]
                event_end_date = row[1]
                compare_date = event_end_date if event_end_date else event_date
                if compare_date and compare_date < date.today():
                    return jsonify({"error": "Registration is closed. This event has already ended."}), 400

            # Check if user is already registered
            cursor.execute('SELECT id FROM "lolEntries" WHERE LOWER(email) = LOWER(%s)', (email,))
            if cursor.fetchone():
                return jsonify({"error": "You are already registered for this event."}), 409

            # Insert registration record
            cursor.execute(
                'INSERT INTO "lolEntries" (email, name, roll_no, chess_username, contact, secondary_email) VALUES (%s, %s, %s, %s, %s, %s)',
                (email, name, roll_no, chess_username, contact, secondary_email or '')
            )
            connection.commit()
            return jsonify({"message": "Successfully registered for League of Legends 6.0!"}), 201

    except Exception as e:
        print(f"LoL Registration Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()

@auth_bp.route('/register-lol/status', methods=['GET'])
@jwt_required()
def register_lol_status():
    email = get_jwt_identity() or ''
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute('SELECT id FROM "lolEntries" WHERE LOWER(email) = LOWER(%s)', (email,))
            is_registered = cursor.fetchone() is not None
            return jsonify({"is_registered": is_registered}), 200
    except Exception as e:
        print(f"LoL Registration Status Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()


@auth_bp.route('/alumni-request', methods=['POST'])
def handle_alumni_request():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    roll_no = (data.get('roll_no') or data.get('rollNo') or '').strip()
    graduation_year = (data.get('graduation_year') or data.get('graduationYear') or '').strip()
    chess_username = (data.get('chess_username') or data.get('chessUsername') or '').strip()
    contact = (data.get('contact') or '').strip()
    notes = (data.get('notes') or '').strip()
    gender = (data.get('gender') or 'Male').strip()

    if not name or not email:
        return jsonify({"error": "Full name and personal email are required."}), 400

    if not EMAIL_REGEX.match(email):
        return jsonify({"error": "Please provide a valid email address."}), 400

    if email.lower().endswith('@iitk.ac.in') and not IITK_EMAIL_REGEX.match(email):
        return jsonify({"error": "IITK email must contain your 2-digit year identifier before @iitk.ac.in (e.g. username25@iitk.ac.in)."}), 400

    # Validate Chess.com ID if provided
    if chess_username:
        if not CHESS_USERNAME_REGEX.match(chess_username):
            return jsonify({"error": "Invalid Chess.com ID format."}), 400
        try:
            chess_res = requests.get(
                f"https://api.chess.com/pub/player/{chess_username.lower()}",
                headers={"User-Agent": "ChessClubIITK-App/1.0 (contact: chessclubiitk@gmail.com)"},
                timeout=5
            )
            if chess_res.status_code == 404:
                return jsonify({"error": f"Chess.com ID '{chess_username}' does not exist. Please enter a valid username."}), 400
        except Exception as err:
            print("Chess.com API check error:", err)

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute("""
                INSERT INTO alumni_requests (name, email, roll_no, graduation_year, chess_username, contact, notes, gender, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending')
                RETURNING id;
            """, (name, email, roll_no, graduation_year, chess_username, contact, notes, gender))
            
            if hasattr(connection, 'commit'):
                connection.commit()
    except Exception as e:
        print(f"Database Alumni Request Error: {e}")
        return jsonify({"error": "Failed to record alumni request in database."}), 500
    finally:
        if connection:
            connection.close()

    return jsonify({
        "success": True,
        "message": "Admins have been notified. Please wait while your request is processed."
    }), 200
