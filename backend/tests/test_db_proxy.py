import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("psycopg", types.ModuleType("psycopg"))
fake_pool_module = types.ModuleType("psycopg_pool")
fake_pool_module.ConnectionPool = Mock
sys.modules.setdefault("psycopg_pool", fake_pool_module)

from config.db import ConnectionProxy


class ConnectionProxyTests(unittest.TestCase):
    def test_close_rolls_back_before_returning_connection(self):
        connection = Mock()
        pool = Mock()
        proxy = ConnectionProxy(connection, pool)

        proxy.close()

        connection.rollback.assert_called_once_with()
        pool.putconn.assert_called_once_with(connection)

    def test_context_commits_success_and_rolls_back_failure(self):
        successful_connection = Mock()
        successful_pool = Mock()
        with ConnectionProxy(successful_connection, successful_pool):
            pass
        successful_connection.commit.assert_called_once_with()

        failed_connection = Mock()
        failed_pool = Mock()
        with self.assertRaises(RuntimeError):
            with ConnectionProxy(failed_connection, failed_pool):
                raise RuntimeError("failure")
        self.assertGreaterEqual(failed_connection.rollback.call_count, 1)


if __name__ == "__main__":
    unittest.main()
