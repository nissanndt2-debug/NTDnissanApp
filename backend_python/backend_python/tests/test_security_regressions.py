"""Pruebas de regresion para controles de seguridad que no deben relajarse."""

from io import BytesIO
import unittest

import jwt
from fastapi import HTTPException
from PIL import Image

from app.config.environment import env
from app.constants.index import ROLE_IDS
from app.controllers.unit_controller import STATUS_TRANSITIONS
from app.routes.uploads import _validate_image
from app.services.auth_service import auth_service
from app.services.blob_storage_service import BlobStorageService
from app.utils.unit_access import ensure_unit_access


class UnitAccessTests(unittest.TestCase):
    def test_cross_plant_unit_is_not_disclosed(self):
        user = {"userId": 10, "roleId": ROLE_IDS["WWS"], "plant": "A1"}
        with self.assertRaises(HTTPException) as raised:
            ensure_unit_access(user, {"id": 99, "plant": "A2", "providerId": 1})
        self.assertEqual(raised.exception.status_code, 404)

    def test_carrier_is_limited_to_its_provider(self):
        user = {"userId": 10, "roleId": ROLE_IDS["CARRIER"], "plant": "A1", "providerId": 1}
        with self.assertRaises(HTTPException) as raised:
            ensure_unit_access(user, {"id": 99, "plant": "A1", "providerId": 2})
        self.assertEqual(raised.exception.status_code, 404)

    def test_status_machine_rejects_skip(self):
        self.assertNotIn("ACCEPTED", STATUS_TRANSITIONS["REPORTED"])
        self.assertEqual(STATUS_TRANSITIONS["WWS_RELEASED"]["ACCEPTED"], {"CARRIER"})


class UploadValidationTests(unittest.TestCase):
    def _jpeg(self) -> bytes:
        output = BytesIO()
        Image.new("RGB", (16, 16), "white").save(output, format="JPEG")
        return output.getvalue()

    def test_rejects_mime_spoofed_image(self):
        with self.assertRaises(HTTPException) as raised:
            _validate_image(self._jpeg(), "image/png")
        self.assertEqual(raised.exception.status_code, 400)

    def test_accepts_valid_jpeg(self):
        _validate_image(self._jpeg(), "image/jpeg")

    def test_only_our_cloudinary_folder_can_be_attached(self):
        storage = BlobStorageService()
        storage._cloudinary_url = "cloudinary://key:secret@company-cloud"
        storage._folder = "defect-photos"
        self.assertTrue(
            storage.is_managed_cloudinary_url(
                "https://res.cloudinary.com/company-cloud/image/upload/v1/defect-photos/abc/photo.jpg"
            )
        )
        self.assertFalse(
            storage.is_managed_cloudinary_url(
                "https://res.cloudinary.com/other-cloud/image/upload/v1/defect-photos/abc/photo.jpg"
            )
        )


class TokenTests(unittest.TestCase):
    def test_refresh_tokens_are_unique_and_identified(self):
        original_secret = env.jwt_secret
        env.jwt_secret = "s" * 48
        try:
            first = auth_service._generate_refresh_token()
            second = auth_service._generate_refresh_token()
            first_payload = jwt.decode(first, env.jwt_secret, algorithms=["HS256"])
            second_payload = jwt.decode(second, env.jwt_secret, algorithms=["HS256"])
            self.assertEqual(first_payload["type"], "refresh")
            self.assertNotEqual(first_payload["jti"], second_payload["jti"])
        finally:
            env.jwt_secret = original_secret


if __name__ == "__main__":
    unittest.main()
