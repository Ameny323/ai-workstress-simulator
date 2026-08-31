"""add image_matching to tasktype enum

Revision ID: b3c4d4c7e67e
Revises: e5e51961e0b6
Create Date: 2026-08-31 18:19:28.993516

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c4d4c7e67e'
down_revision: Union[str, Sequence[str], None] = 'e5e51961e0b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Pure addition -- ADD VALUE is safe here since we don't use the new
    # value later in this same transaction.
    op.execute("ALTER TYPE tasktype ADD VALUE 'image_matching'")


def downgrade() -> None:
    """Downgrade schema."""
    # Postgres has no DROP VALUE, so this is the same
    # rename/recreate/cast dance as the original tasktype migration.
    # Any existing image_matching rows fall back to data_validation --
    # lossy, but this is dev-environment defensive coverage, not an
    # expected real path.
    op.execute("ALTER TYPE tasktype RENAME TO tasktype_new")
    op.execute(
        "CREATE TYPE tasktype AS ENUM "
        "('data_validation', 'document_organization', 'email_writing', 'urgent_request')"
    )
    op.execute(
        """
        ALTER TABLE tasks
        ALTER COLUMN type TYPE tasktype
        USING (
            CASE type::text
                WHEN 'image_matching' THEN 'data_validation'
                ELSE type::text
            END
        )::tasktype
        """
    )
    op.execute(
        """
        ALTER TABLE task_templates
        ALTER COLUMN task_type TYPE tasktype
        USING (
            CASE task_type::text
                WHEN 'image_matching' THEN 'data_validation'
                ELSE task_type::text
            END
        )::tasktype
        """
    )
    op.execute("DROP TYPE tasktype_new")
