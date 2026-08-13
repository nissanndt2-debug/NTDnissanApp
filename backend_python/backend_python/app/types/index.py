from typing import Literal

from pydantic import BaseModel

Plant = Literal["A1", "A2"]


class LoginDTO(BaseModel):
    email: str
    password: str


class CreateUserDTO(BaseModel):
    email: str
    password: str
    name: str
    role_id: int | str
    provider_id: int | None = None
    plant: Plant | None = None


class CreateUnitDTO(BaseModel):
    vin: str
    market: str
    lane: str
    registered_by_id: int
    provider_id: int | None = None
    plant: Plant | None = None


class UpdateUnitStatusDTO(BaseModel):
    new_status: str
    changed_by_id: int
    estimated_repair_hours: float | None = None
    is_available_today: bool | None = None
    note: str | None = None
    wty_comment: str | None = None


class DefectDTO(BaseModel):
    defect_type: str
    zone: str
    grade: str
    registered_by_id: int
    description: str | None = None
    is_from_wws: bool = False
    override_existing: bool = False
    wws_version: str | None = None
