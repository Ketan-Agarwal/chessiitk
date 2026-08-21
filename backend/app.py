import os
import jwt
import datetime
from functools import wraps
from flask import Flask, jsonify, request, g
from flask_cors import CORS
from dotenv import load_dotenv
from config.db import get_db_connection
from security_controls import consume_rate_limit, get_client_address, token_matches_current_user, verify_recaptcha
from media_storage import InvalidImageError, MediaConfigurationError, delete_uploaded_image, save_uploaded_image
import bcrypt
from flask_jwt_extended import JWTManager, create_access_token
import time

# Load your local .env file BEFORE anything else
load_dotenv()

# Import your blueprints
from routes.auth import auth_bp
from routes.blogs import blogs_bp
from routes.events import events_bp

app = Flask(__name__)
jwt_secret = os.environ.get("JWT_SECRET")
if not jwt_secret:
    jwt_secret = os.environ.get("JWT_SECRET_DEV")
if not jwt_secret:
    raise RuntimeError("JWT_SECRET must be configured before the backend can start.")

app.config["JWT_TOKEN_LOCATION"] = ["headers"]
app.config["JWT_SECRET_KEY"] = jwt_secret
app.config["JWT_SECRET"] = jwt_secret
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(
    hours=int(os.environ.get("JWT_ACCESS_TOKEN_HOURS", "12"))
)
jwt_manager = JWTManager(app)


def is_current_token(payload):
    identity = (payload.get('sub') or '').strip()
    token_version = payload.get('token_version')
    if not identity or token_version is None:
        return False
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT token_version, is_admin FROM users WHERE LOWER(email) = LOWER(%s)",
                (identity,),
            )
            user = cursor.fetchone()
            return bool(user) and token_matches_current_user(payload, user[0], user[1])
    finally:
        if conn:
            conn.close()


@jwt_manager.token_in_blocklist_loader
def revoked_or_stale_token(_jwt_header, jwt_payload):
    return not is_current_token(jwt_payload)

# Limit maximum upload size to 16MB to prevent memory exhaustion / DoS
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Allow your local React app and production site to connect
CORS(
    app,
    origins=[
        "http://localhost:5173",
        "https://chess-club-iitk-myfork.vercel.app",
        "https://chess-club-iitk-w7u5.vercel.app"
    ]
)

app.register_blueprint(auth_bp, url_prefix='/api')
app.register_blueprint(blogs_bp, url_prefix='/api')
app.register_blueprint(events_bp)

@app.before_request
def before_request():
    # Record the high-precision start time when the request hits the server
    g.start_time = time.perf_counter()

@app.after_request
def after_request(response):
    # Calculate how long the request took if start_time exists
    if hasattr(g, 'start_time'):
        elapsed_ms = (time.perf_counter() - g.start_time) * 1000
        response.headers['X-Response-Time'] = f"{elapsed_ms:.2f}ms"
    
    # Standard Security Headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
        
    return response

@app.route('/api/login', methods=['POST'])
def login():
    conn = None
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or data.get('email') or '').strip()
        password = data.get('password') or ''

        if not username or not password:
            return jsonify({'error': 'Username and password are required.'}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()

        limit = int(os.environ.get("LOGIN_RATE_LIMIT_ATTEMPTS", "10"))
        window = int(os.environ.get("LOGIN_RATE_LIMIT_WINDOW_SECONDS", "900"))
        client_address = get_client_address(request)
        ip_allowed = consume_rate_limit(cursor, "login-ip", client_address, limit, window)
        account_allowed = consume_rate_limit(cursor, "login-account", username, limit, window)
        conn.commit()
        if not ip_allowed or not account_allowed:
            cursor.close()
            return jsonify({'error': 'Too many login attempts. Please try again later.'}), 429

        captcha_ok, captcha_error = verify_recaptcha(data.get('recaptcha_token'), 'login')
        if not captcha_ok:
            cursor.close()
            status = 503 if captcha_error in {'configuration', 'unavailable'} else 400
            return jsonify({'error': 'Unable to verify that you are human. Please try again.'}), status
        
        cursor.execute(
            "SELECT id, is_admin, password_hash, email, token_version FROM users WHERE LOWER(email) = LOWER(%s) OR LOWER(secondary_email) = LOWER(%s)", 
            (username, username)
        )
        user = cursor.fetchone()
        cursor.close()
        
        # Check if user exists and password matches the hash
        if user and bcrypt.checkpw(password.encode('utf-8'), user[2].encode('utf-8')):
            user_role = 'secretary' if user[1] else 'member'
            canonical_email = user[3] if user[3] else (username if '@' in username else "")
            additional_claims = {"role": user_role, "is_admin": bool(user[1]), "user_id": user[0], "token_version": user[4]}
            token = create_access_token(identity=canonical_email, additional_claims=additional_claims)
            
            return jsonify({'token': token, 'role': user_role}), 200
            
        return jsonify({'error': 'Invalid username or password.'}), 401
        
    except Exception as e:
        print(f"CRITICAL LOGIN EXCEPTION: {str(e)}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if conn:
            conn.close()

@app.route("/health")
def health():
    return {"status": "ok"}


@app.route("/db-test")
def db_test():
    conn = None
    try:
        conn = get_db_connection()
        return {"database": "connected"}
    finally:
        if conn:
            conn.close()


@app.route('/api/gallery', methods=['GET'])
def get_gallery():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor() 
        
        cursor.execute("SELECT id, image_url, category, album_type, title, description FROM gallery ORDER BY created_at DESC")
        
        # 1. Get the column names from the cursor
        columns = [col[0] for col in cursor.description]
        
        # 2. Fetch all rows and manually zip them into dictionaries
        images = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        cursor.close()
        return jsonify(images), 200
    except Exception as e:
        print(f"GET GALLERY ERROR: {e}")
        return jsonify({"error": "Failed to fetch gallery."}), 500
    finally:
        if conn:
            conn.close()

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:].strip()
            
        if not token:
            return jsonify({'error': 'Token is missing! Access denied.'}), 401
            
        try:
            data = jwt.decode(token, app.config["JWT_SECRET_KEY"], algorithms=['HS256'])
            if not is_current_token(data):
                return jsonify({'error': 'Token has been revoked. Please log in again.'}), 401
            role_to_check = data.get('role')
            
            if role_to_check != 'secretary':
                return jsonify({'error': 'Admin privileges required.'}), 403
                
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired. Please log in again.'}), 401
        except jwt.PyJWTError:
            return jsonify({'error': 'Invalid token.'}), 401
        except Exception:
            return jsonify({'error': 'Authentication failed.'}), 401
            
        return f(*args, **kwargs)
    return decorated


@app.route('/api/carousel', methods=['POST'])
@token_required
def upload_carousel_image():
    conn = None
    db_path = None
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image provided"}), 400
            
        file = request.files['image']
        
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400

        db_path = save_uploaded_image(file)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO featured_carousel (image_url) VALUES (%s) RETURNING id", (db_path,))
        new_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        
        return jsonify({
            "message": "Image uploaded successfully!", 
            "id": new_id,
            "image_url": db_path
        }), 200
        
    except InvalidImageError as e:
        return jsonify({"error": str(e)}), 400
    except MediaConfigurationError as e:
        print(f"MEDIA CONFIGURATION ERROR: {e}")
        return jsonify({"error": "Media storage is not configured."}), 503
    except Exception as e:
        if db_path:
            try:
                delete_uploaded_image(db_path)
            except Exception:
                pass
        print(f"UPLOAD CAROUSEL ERROR: {e}")
        return jsonify({"error": "Failed to upload carousel image."}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/upload', methods=['POST'])
@token_required
def upload_general_file():
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image provided"}), 400
            
        file = request.files['image']
        
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400

        db_path = save_uploaded_image(file)
        
        return jsonify({
            "message": "Image uploaded successfully!", 
            "image_url": db_path
        }), 200
        
    except InvalidImageError as e:
        return jsonify({"error": str(e)}), 400
    except MediaConfigurationError as e:
        print(f"MEDIA CONFIGURATION ERROR: {e}")
        return jsonify({"error": "Media storage is not configured."}), 503
    except Exception as e:
        print(f"UPLOAD GENERAL FILE ERROR: {e}")
        return jsonify({"error": "Failed to upload file."}), 500
    

@app.route('/api/carousel', methods=['GET'])
def get_carousel_images():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor() 
        
        cursor.execute("SELECT id, image_url FROM featured_carousel ORDER BY id DESC")
        
        row_headers = [x[0] for x in cursor.description]
        images = [dict(zip(row_headers, row)) for row in cursor.fetchall()]
        
        cursor.close()
        return jsonify(images), 200
        
    except Exception as e:
        print(f"GET CAROUSEL ERROR: {e}") 
        return jsonify({"error": "Failed to retrieve carousel images."}), 500
    finally:
        if conn:
            conn.close()
    
@app.route('/api/carousel/<int:image_id>', methods=['DELETE'])
@token_required
def delete_carousel_image(image_id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Fetch the image URL first so we know what physical file to delete
        cursor.execute("SELECT image_url FROM featured_carousel WHERE id = %s", (image_id,))
        row = cursor.fetchone()
        
        image_url = row[0] if row else None
        
        # 2. Delete the record from the database
        cursor.execute("DELETE FROM featured_carousel WHERE id = %s", (image_id,))
        conn.commit()
        cursor.close()

        if image_url:
            try:
                delete_uploaded_image(image_url)
            except Exception as del_err:
                print(f"Error removing stored media: {del_err}")
        
        return jsonify({"message": "Image deleted successfully!"}), 200
    except Exception as e:
        print(f"DELETE CAROUSEL ERROR: {e}")
        return jsonify({"error": "Failed to delete carousel image."}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/config/featured', methods=['GET'])
def get_featured_config():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT config_key, config_value FROM site_config WHERE config_key IN ('featured_title', 'featured_desc')")
        rows = cursor.fetchall()
        
        config_dict = {row[0]: row[1] for row in rows}
        
        cursor.close()
        return jsonify(config_dict), 200
    except Exception as e:
        print(f"GET FEATURED CONFIG ERROR: {e}")
        return jsonify({"error": "Failed to get site configuration."}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/gallery/memories', methods=['DELETE'])
@token_required 
def delete_memory():
    conn = None
    try:
        data = request.get_json(silent=True) or {}
        image_url_to_delete = data.get('image_url')
        
        if not image_url_to_delete:
            return jsonify({"error": "No image URL provided"}), 400

        # Delete from Database
        conn = get_db_connection()
        cursor = conn.cursor()
            
        cursor.execute("DELETE FROM gallery WHERE image_url = %s", (image_url_to_delete,))
        conn.commit()
        cursor.close()

        try:
            delete_uploaded_image(image_url_to_delete)
        except Exception as e:
            print(f"Error deleting stored media: {e}")

        return jsonify({"message": "Photo deleted successfully"}), 200
    except Exception as e:
        print(f"DELETE MEMORY ERROR: {e}")
        return jsonify({"error": "Failed to delete memory."}), 500
    finally:
        if conn:
            conn.close()


@app.route('/api/gallery/memories/replace', methods=['POST'])
@token_required 
def replace_memory():
    conn = None
    new_image_url = None
    try:
        if 'new_image' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
            
        file = request.files['new_image']
        old_image_url = request.form.get('old_image_url')

        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        new_image_url = save_uploaded_image(file)

        # 2. Update Database with the new local path
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "UPDATE gallery SET image_url = %s WHERE image_url = %s", 
            (new_image_url, old_image_url)
        )
        if cursor.rowcount == 0:
            conn.rollback()
            delete_uploaded_image(new_image_url)
            return jsonify({"error": "Photo not found."}), 404
        conn.commit()
        cursor.close()

        # 3. Delete the old physical file safely
        try:
            if old_image_url:
                delete_uploaded_image(old_image_url)
        except Exception as e:
            print(f"Error deleting old stored media: {e}")

        return jsonify({"message": "Photo replaced", "new_image_url": new_image_url}), 200
    except InvalidImageError as e:
        return jsonify({"error": str(e)}), 400
    except MediaConfigurationError as e:
        print(f"MEDIA CONFIGURATION ERROR: {e}")
        return jsonify({"error": "Media storage is not configured."}), 503
    except Exception as e:
        if new_image_url:
            try:
                delete_uploaded_image(new_image_url)
            except Exception:
                pass
        print(f"REPLACE MEMORY ERROR: {e}")
        return jsonify({"error": "Failed to replace photo."}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/config/featured', methods=['PUT'])
@token_required 
def update_featured_config():
    conn = None
    try:
        data = request.get_json(silent=True) or {}
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("UPDATE site_config SET config_value = %s WHERE config_key = 'featured_title'", (data.get('title', ''),))
        cursor.execute("UPDATE site_config SET config_value = %s WHERE config_key = 'featured_desc'", (data.get('description', ''),))
        
        conn.commit()
        cursor.close()
        return jsonify({"message": "Successfully updated!"}), 200
        
    except Exception as e:
        print(f"UPDATE FEATURED CONFIG ERROR: {e}")
        return jsonify({"error": "Failed to update configuration."}), 500
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    # Local development settings with auto-reload enabled
    app.run(debug=True)
