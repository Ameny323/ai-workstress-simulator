"""task generation columns and STATIC generation type

Revision ID: 04646cd4d785
Revises: e5934618b1f3
Create Date: 2026-09-15 20:12:22.149414

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '04646cd4d785'
down_revision: Union[str, Sequence[str], None] = 'e5934618b1f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    ALTER TYPE ... ADD VALUE cannot run inside the same transaction as
    anything that might use the new value (Postgres restriction) -- run it
    in its own autocommit block, same as Alembic's own documented pattern,
    BEFORE the add_column below that references 'STATIC'.
    """
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE generationtype ADD VALUE IF NOT EXISTS 'STATIC'")

    op.add_column('tasks', sa.Column(
        'generation_type',
        postgresql.ENUM('LLM', 'FALLBACK', 'SYSTEM', 'STATIC', name='generationtype', create_type=False),
        nullable=False, server_default='STATIC',
    ))
    op.add_column('tasks', sa.Column('generation_prompt_version', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema.

    Postgres has no DROP VALUE for enum types, so 'STATIC' is left in the
    generationtype enum on downgrade -- an inert extra label, matching how
    this project's other enum-extending migrations already behave.
    """
    op.drop_column('tasks', 'generation_prompt_version')
    op.drop_column('tasks', 'generation_type')
