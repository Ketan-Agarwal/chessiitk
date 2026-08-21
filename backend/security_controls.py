import hashlib
import os

import requests


RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"


def verify_recaptcha(token, expected_action):
    """Validate a reCAPTCHA v3 token and bind it to the intended operation."""
    secret = (os.environ.get("RECAPTCHA_SECRET_KEY") or "").strip()
    if not secret:
        return False, "configuration"
    if not token:
        return False, "missing"

    try:
        response = requests.post(
            RECAPTCHA_VERIFY_URL,
            data={"secret": secret, "response": token},
            timeout=5,
        )
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError):
        return False, "unavailable"

    if not result.get("success") or result.get("action") != expected_action:
        return False, "invalid"

    try:
        score = float(result.get("score", 0))
        minimum_score = float(os.environ.get("RECAPTCHA_MIN_SCORE", "0.5"))
    except (TypeError, ValueError):
        return False, "configuration"
    if score < minimum_score:
        return False, "low_score"

    allowed_hostnames = {
        hostname.strip().lower()
        for hostname in os.environ.get("RECAPTCHA_ALLOWED_HOSTNAMES", "").split(",")
        if hostname.strip()
    }
    response_hostname = (result.get("hostname") or "").strip().lower()
    if allowed_hostnames and response_hostname not in allowed_hostnames:
        return False, "hostname"

    return True, None


def rate_limit_key(scope, identifier):
    normalized = str(identifier or "unknown").strip().lower()
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"{scope}:{digest}"


def consume_rate_limit(cursor, scope, identifier, limit, window_seconds):
    """Atomically consume one attempt in a database-backed fixed window."""
    cursor.execute(
        """
        INSERT INTO security_rate_limits (rate_key, window_started_at, attempts)
        VALUES (%s, CURRENT_TIMESTAMP, 1)
        ON CONFLICT (rate_key) DO UPDATE SET
            window_started_at = CASE
                WHEN security_rate_limits.window_started_at <
                     CURRENT_TIMESTAMP - make_interval(secs => %s)
                THEN CURRENT_TIMESTAMP
                ELSE security_rate_limits.window_started_at
            END,
            attempts = CASE
                WHEN security_rate_limits.window_started_at <
                     CURRENT_TIMESTAMP - make_interval(secs => %s)
                THEN 1
                ELSE security_rate_limits.attempts + 1
            END
        RETURNING attempts
        """,
        (rate_limit_key(scope, identifier), window_seconds, window_seconds),
    )
    return cursor.fetchone()[0] <= limit
