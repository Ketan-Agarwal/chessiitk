import os
import psycopg
from psycopg_pool import ConnectionPool

_pool = None

def get_pool():
    global _pool
    if _pool is None:
        # Pass DB credentials inside the kwargs dict.
        # This keeps the parameters isolated and prevents psycopg from parsing backslashes in passwords as escape characters.
        conn_kwargs = {
            'host': os.environ.get('DB_HOST', '127.0.0.1'),
            'port': int(os.environ.get('DB_PORT', 5432)),
            'user': os.environ.get('DB_USER', ''),
            'password': os.environ.get('DB_PASSWORD', ''),
            'dbname': os.environ.get('DB_NAME', ''),
            'sslmode': os.environ.get('DB_SSLMODE', 'require')
        }
        _pool = ConnectionPool(
            conninfo="",
            kwargs=conn_kwargs,
            min_size=1,
            max_size=10,
            open=True,
            configure=lambda conn: setattr(conn, 'autocommit', True)
        )
    return _pool

class ConnectionProxy:
    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if self._conn:
                self._conn.__exit__(exc_type, exc_val, exc_tb)
        finally:
            self.close()

    def close(self):
        # Return connection back to the pool instead of closing the physical connection
        if self._conn and self._pool:
            self._pool.putconn(self._conn)
            self._conn = None
            self._pool = None

def get_db_connection():
    pool = get_pool()
    conn = pool.getconn()
    return ConnectionProxy(conn, pool)
