from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt, jwt_required
from config.db import get_db_connection
from urllib.parse import urlparse

events_bp = Blueprint('events', __name__)


def secretary_required():
    jwt_data = get_jwt() or {}
    if jwt_data.get('role') != 'secretary':
        return jsonify({"error": "Secretary privileges required."}), 403
    return None


def is_safe_registration_link(value):
    if not value:
        return True
    if not isinstance(value, str):
        return False
    parsed = urlparse(value.strip())
    return parsed.scheme in {'http', 'https'} and bool(parsed.netloc)


@events_bp.route('/api/events', methods=['POST'])
@jwt_required()
def create_event():
    authorization_error = secretary_required()
    if authorization_error:
        return authorization_error

    data = request.get_json(silent=True) or {}
    
    title = (data.get('title') or '').strip()
    event_type = (data.get('event_type') or '').strip()
    short_description = data.get('short_description')
    event_briefing = data.get('event_briefing')
    event_date = data.get('event_date') 
    event_time = data.get('event_time')
    location = data.get('location')
    format_type = data.get('format')
    register_link = data.get('register_link')
    event_end_date = data.get('event_end_date') or None

    # Basic validation
    if not title or not event_type or not event_date or not event_time:
        return jsonify({"error": "Missing required fields (title, event_type, event_date, event_time)."}), 400
    if not is_safe_registration_link(register_link):
        return jsonify({"error": "Registration link must be a valid HTTP(S) URL."}), 400

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        query = """
            INSERT INTO events (
                title, event_type, short_description, event_briefing, 
                event_date, event_time, location, format, register_link, event_end_date
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        cur.execute(query, (
            title, event_type, short_description, event_briefing, 
            event_date, event_time, location, format_type, register_link, event_end_date
        ))
        
        conn.commit()
        cur.close()
        return jsonify({"message": "Event created successfully!"}), 201

    except Exception as e:
        print(f"Error inserting event: {e}")
        return jsonify({"error": "Database insertion failed"}), 500
    finally:
        if conn:
            conn.close()
    
@events_bp.route('/api/events', methods=['GET'])
def get_events():
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor() 
        
        cur.execute("SELECT * FROM events ORDER BY event_date ASC")
        
        columns = [col[0] for col in cur.description]
        events_data = [dict(zip(columns, row)) for row in cur.fetchall()]
        
        cur.close()
        return jsonify(events_data), 200

    except Exception as e:
        print(f"Error fetching events: {e}")
        return jsonify({"error": "Failed to fetch events"}), 500
    finally:
        if conn:
            conn.close()
    
@events_bp.route('/api/events/<int:event_id>', methods=['PUT', 'DELETE', 'OPTIONS'])
@jwt_required(optional=True)
def modify_event(event_id):
    if request.method == 'OPTIONS':
        return jsonify({"message": "CORS preflight successful"}), 200

    authorization_error = secretary_required()
    if authorization_error:
        return authorization_error

    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        if request.method == 'DELETE':
            cur.execute("DELETE FROM events WHERE id = %s", (event_id,))
            if cur.rowcount == 0:
                cur.close()
                return jsonify({"error": "Event not found."}), 404
            conn.commit()
            cur.close()
            return jsonify({"message": "Event deleted successfully!"}), 200

        if request.method == 'PUT':
            data = request.get_json(silent=True) or {}
            if not is_safe_registration_link(data.get('register_link')):
                return jsonify({"error": "Registration link must be a valid HTTP(S) URL."}), 400
            
            query = """
                UPDATE events 
                SET title=%s, event_type=%s, short_description=%s, event_briefing=%s, 
                    event_date=%s, event_time=%s, location=%s, format=%s, register_link=%s,
                    event_end_date=%s
                WHERE id = %s
            """
            cur.execute(query, (
                data.get('title'), data.get('event_type'), data.get('short_description'), 
                data.get('event_briefing'), data.get('event_date'), data.get('event_time'), 
                data.get('location'), data.get('format'), data.get('register_link'),
                data.get('event_end_date') or None,
                event_id
            ))
            if cur.rowcount == 0:
                cur.close()
                return jsonify({"error": "Event not found."}), 404
            conn.commit()
            cur.close()
            return jsonify({"message": "Event updated successfully!"}), 200

    except Exception as e:
        print(f"Error modifying event: {e}")
        return jsonify({"error": "Database operation failed"}), 500
    
    finally:
        if conn:
            conn.close()

@events_bp.route('/api/events/debug_log', methods=['POST'])
@jwt_required()
def debug_log():
    authorization_error = secretary_required()
    if authorization_error:
        return authorization_error

    data = request.get_json(silent=True) or {}
    raw_msg = str(data.get('msg', ''))[:500]
    # Strip dangerous control characters to prevent log injection
    sanitized_msg = "".join(ch for ch in raw_msg if ch.isprintable() or ch in ('\t', ' '))
    return jsonify({"status": "ok"}), 200
