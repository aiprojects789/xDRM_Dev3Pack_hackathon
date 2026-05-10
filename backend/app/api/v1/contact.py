from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .email import send_email

router = APIRouter()

class ContactRequest(BaseModel):
    name: str
    email: str
    subject: str
    message: str

@router.post("/contact-us")
def contact_us(data: ContactRequest):
    full_message = f"From: {data.name}\nEmail: {data.email}\n\n{data.message}"
    if send_email(data.subject, full_message, "drm@softechdigitalgroup.com"):
        return {"message": "Your message has been sent."}
    else:
        raise HTTPException(status_code=500, detail="Failed to send email")
