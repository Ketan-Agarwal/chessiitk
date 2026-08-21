import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from security_controls import rate_limit_key, token_matches_current_user, verify_recaptcha


class RecaptchaTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ,
            {
                "RECAPTCHA_SECRET_KEY": "server-secret",
                "RECAPTCHA_MIN_SCORE": "0.5",
                "RECAPTCHA_ALLOWED_HOSTNAMES": "chess.example,localhost",
            },
            clear=True,
        )
        self.environment.start()

    def tearDown(self):
        self.environment.stop()

    @patch("security_controls.requests.post")
    def test_accepts_matching_action_score_and_hostname(self, post):
        response = Mock()
        response.json.return_value = {
            "success": True,
            "action": "login",
            "score": 0.9,
            "hostname": "chess.example",
        }
        post.return_value = response

        self.assertEqual(verify_recaptcha("token", "login"), (True, None))
        post.assert_called_once()

    @patch("security_controls.requests.post")
    def test_rejects_token_replayed_for_another_action(self, post):
        response = Mock()
        response.json.return_value = {
            "success": True,
            "action": "signup",
            "score": 0.9,
            "hostname": "chess.example",
        }
        post.return_value = response

        self.assertEqual(verify_recaptcha("token", "login"), (False, "invalid"))

    @patch("security_controls.requests.post")
    def test_rejects_low_score_or_unapproved_hostname(self, post):
        response = Mock()
        post.return_value = response
        response.json.return_value = {
            "success": True,
            "action": "login",
            "score": 0.1,
            "hostname": "chess.example",
        }
        self.assertEqual(verify_recaptcha("token", "login"), (False, "low_score"))

        response.json.return_value = {
            "success": True,
            "action": "login",
            "score": 0.9,
            "hostname": "attacker.example",
        }
        self.assertEqual(verify_recaptcha("token", "login"), (False, "hostname"))

    def test_fails_closed_without_server_secret(self):
        del os.environ["RECAPTCHA_SECRET_KEY"]
        self.assertEqual(verify_recaptcha("token", "login"), (False, "configuration"))

    def test_rate_limit_keys_do_not_store_user_input(self):
        key = rate_limit_key("login-account", "Student25@iitk.ac.in")
        self.assertTrue(key.startswith("login-account:"))
        self.assertNotIn("student25", key)


class TokenFreshnessTests(unittest.TestCase):
    def test_rejects_secretary_token_after_demotion(self):
        payload = {"token_version": 2, "role": "secretary", "is_admin": True}
        self.assertFalse(token_matches_current_user(payload, 2, False))

    def test_accepts_token_only_when_version_and_role_are_current(self):
        payload = {"token_version": 2, "role": "member", "is_admin": False}
        self.assertTrue(token_matches_current_user(payload, 2, False))
        self.assertFalse(token_matches_current_user(payload, 3, False))


if __name__ == "__main__":
    unittest.main()
