import os
import httpx
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

EMAIL_SERVICE_URL = os.getenv("EMAIL_SERVICE_URL", "http://email-service:3001")
EMAIL_SERVICE_API_KEY = os.getenv("EMAIL_SERVICE_API_KEY")

async def send_reset_otp_via_service(to_email: str, otp: str) -> bool:
    if not EMAIL_SERVICE_API_KEY:
        logger.error("EMAIL_SERVICE_API_KEY is not configured.")
        return False

    url = f"{EMAIL_SERVICE_URL.rstrip('/')}/send-email"
    headers = {
        "Authorization": f"Bearer {EMAIL_SERVICE_API_KEY}",
        "Content-Type": "application/json"
    }

    # Use the HTML template for the email content (which matches the Node service template style)
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }}
            .container {{ max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
            .header {{ background-color: #0f172a; padding: 20px; text-align: center; color: white; }}
            .header h1 {{ margin: 0; font-size: 24px; font-weight: 600; }}
            .content {{ padding: 30px; color: #334155; }}
            .otp-box {{ background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 15px; text-align: center; margin: 25px 0; }}
            .otp-code {{ font-size: 32px; font-weight: bold; color: #0f172a; letter-spacing: 4px; margin: 0; }}
            .footer {{ padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>NEXUS OS</h1>
            </div>
            <div class="content">
                <p><strong>Password Reset Verification</strong></p>
                <p>Your verification code is:</p>
                <div class="otp-box">
                    <p class="otp-code">{otp}</p>
                </div>
                <p>This code expires in 10 minutes.</p>
                <p>If you did not request this password reset, you can safely ignore this email.</p>
            </div>
            <div class="footer">
                <p>For security reasons, do not share this code with anyone.</p>
            </div>
        </div>
    </body>
    </html>
    """

    text_content = f"""NEXUS OS\n\nPassword Reset Verification\n\nYour verification code is:\n\n{otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this password reset, you can safely ignore this email.\n\nFor security reasons, do not share this code with anyone."""

    payload = {
        "to": to_email,
        "subject": "NEXUS Password Reset OTP",
        "html": html_content,
        "text": text_content
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    logger.info("Email delivery successfully requested from email-service.")
                    return True
                else:
                    logger.error(f"Email service returned failure: {data.get('message')}")
                    return False
            else:
                logger.error(f"Email service returned non-200 status code: {response.status_code}")
                return False
    except httpx.TimeoutException:
        logger.error("Timeout while attempting to reach email-service.")
        return False
    except httpx.RequestError as e:
        logger.error("Connection error while attempting to reach email-service.")
        return False
    except Exception as e:
        logger.error("Unexpected error occurred while contacting email-service.")
        return False
