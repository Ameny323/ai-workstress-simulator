import uuid

from sqlalchemy import Column, Text, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import RecommendationCategory


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id"), nullable=False)
    content = Column(Text, nullable=False)
    category = Column(Enum(RecommendationCategory))

    report = relationship("Report", back_populates="recommendations")
