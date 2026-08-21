import psycopg
from psycopg.rows import dict_row
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from config.db import get_db_connection

blogs_bp = Blueprint('blogs', __name__)

# --- UTILITY: Admin Authorization Middleware Check ---
def verify_admin_privileges(cursor):
    jwt_data = get_jwt() or {}
    if jwt_data.get('role') != 'secretary':
        return False

    email = get_jwt_identity() or ''
    cursor.execute("SELECT is_admin FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
    user = cursor.fetchone()
    return user and bool(user.get('is_admin'))


# --- CREATE: Add a New Blog (Admin Only) ---
@blogs_bp.route('/blogs', methods=['POST'])
@jwt_required()
def create_blog():
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    subtitle = (data.get('subtitle') or '').strip()
    content = (data.get('content') or '').strip()
    cover_image = data.get('cover_image')
    # Read the text box values typed by the writer
    author_name = (data.get('author_name') or 'Chess Club Team').strip()
    author_position = (data.get('author_position') or 'Coordinator, Chess Club IITK').strip()
    created_at = data.get('created_at') or None

    if not title or not content:
        return jsonify({"error": "Missing required fields (title, content)."}), 400

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor(row_factory=dict_row) as cursor:
            if not verify_admin_privileges(cursor):
                return jsonify({"error": "Access Denied: Admin privileges required."}), 403

            email = get_jwt_identity() or ''

            sql = """
                INSERT INTO blogs (title, subtitle, content, cover_image, author_email, author_name, author_position, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (title, subtitle, content, cover_image, email, author_name, author_position, created_at))
            connection.commit()
            return jsonify({"message": "Blog post published successfully!"}), 201
    except Exception as e:
        print(f"Blog Creation Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()


# --- READ ALL: Fetch All Blogs (Public) ---
@blogs_bp.route('/blogs', methods=['GET'])
def get_all_blogs():
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor(row_factory=dict_row) as cursor:
            # We now select author_name and author_position directly out of the blogs row record itself!
            sql = """
                SELECT 
                    id, title, subtitle, content, cover_image, author_email, created_at,
                    COALESCE(author_name, 'Chess Club Team') AS author_name,
                    COALESCE(author_position, 'Coordinator, Chess Club IITK') AS author_position
                FROM blogs
                ORDER BY created_at DESC NULLS LAST, id DESC
            """
            cursor.execute(sql)
            blogs = cursor.fetchall()
            return jsonify(blogs), 200
    except Exception as e:
        print(f"Fetch Blogs Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()


# --- READ ONE: Fetch Single Blog by ID (Public) ---
@blogs_bp.route('/blogs/<int:blog_id>', methods=['GET'])
def get_single_blog(blog_id):
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor(row_factory=dict_row) as cursor:
            sql = """
                SELECT 
                    id, title, subtitle, content, cover_image, author_email, created_at,
                    COALESCE(author_name, 'Chess Club Team') AS author_name,
                    COALESCE(author_position, 'Coordinator, Chess Club IITK') AS author_position
                FROM blogs
                WHERE id = %s
            """
            cursor.execute(sql, (blog_id,))
            blog = cursor.fetchone()
            if not blog:
                return jsonify({"error": "Blog post not found"}), 404
            return jsonify(blog), 200
    except Exception as e:
        print(f"Fetch Single Blog Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()


# --- DELETE: Remove a Blog (Admin Only) ---
@blogs_bp.route('/blogs/<int:blog_id>', methods=['DELETE'])
@jwt_required()
def delete_blog(blog_id):
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor(row_factory=dict_row) as cursor:
            if not verify_admin_privileges(cursor):
                return jsonify({"error": "Access Denied: Admin privileges required."}), 403

            cursor.execute("DELETE FROM blogs WHERE id = %s", (blog_id,))
            if cursor.rowcount == 0:
                return jsonify({"error": "Blog post not found."}), 404
            connection.commit()
            return jsonify({"message": "Blog post deleted successfully."}), 200
    except Exception as e:
        print(f"Delete Blog Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()

# --- UPDATE: Modify an Existing Blog (Admin Only) ---
@blogs_bp.route('/blogs/<int:blog_id>', methods=['PUT'])
@jwt_required()
def update_blog(blog_id):
    data = request.get_json(silent=True) or {}
    title = data.get('title')
    subtitle = data.get('subtitle')
    content = data.get('content')
    cover_image = data.get('cover_image')
    author_name = data.get('author_name')
    author_position = data.get('author_position')
    created_at = data.get('created_at') or None

    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor(row_factory=dict_row) as cursor:
            if not verify_admin_privileges(cursor):
                return jsonify({"error": "Access Denied: Admin privileges required."}), 403

            if 'created_at' in data:
                sql = """
                    UPDATE blogs 
                    SET title = %s, subtitle = %s, content = %s, cover_image = %s, author_name = %s, author_position = %s, created_at = %s
                    WHERE id = %s
                """
                cursor.execute(sql, (title, subtitle, content, cover_image, author_name, author_position, created_at, blog_id))
            else:
                sql = """
                    UPDATE blogs 
                    SET title = %s, subtitle = %s, content = %s, cover_image = %s, author_name = %s, author_position = %s
                    WHERE id = %s
                """
                cursor.execute(sql, (title, subtitle, content, cover_image, author_name, author_position, blog_id))

            if cursor.rowcount == 0:
                return jsonify({"error": "Blog post not found."}), 404

            connection.commit()
            return jsonify({"message": "Blog post updated successfully!"}), 200
    except Exception as e:
        print(f"Blog Update Error: {e}")
        return jsonify({"error": "Internal server error."}), 500
    finally:
        if connection:
            connection.close()
