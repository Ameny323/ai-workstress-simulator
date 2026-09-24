"""stress declaration 1-5 scale fields

Revision ID: 7ee70dd83a67
Revises: 04646cd4d785
Create Date: 2026-09-15 20:36:57.112224

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '7ee70dd83a67'
down_revision: Union[str, Sequence[str], None] = '04646cd4d785'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Stress declaration moves from an ad-hoc 0-100 self-report to the
    product-specified 1-5 scale (Calm..Extreme). The two existing dev rows
    (values 30/75) belong to the old scale and have no valid meaning under
    the new one -- deleted here rather than silently left to violate the
    new CHECK constraint. This table has no production data (pre-launch
    research tool); a real migration path would map/backfill instead.
    """
    op.execute("DELETE FROM stress_declarations")

    op.add_column('stress_declarations', sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tasks.id'), nullable=True))
    op.add_column('stress_declarations', sa.Column('elapsed_seconds', sa.Float(), nullable=True))
    op.add_column('stress_declarations', sa.Column(
        'simulation_phase',
        postgresql.ENUM('accueil', 'montee_pression', 'pic_charge', 'debriefing', name='sessionphase', create_type=False),
        nullable=True,
    ))
    op.add_column('stress_declarations', sa.Column(
        'aria_state',
        postgresql.ENUM('bienveillant', 'neutre', 'exigeant', 'intrusif', name='managertone', create_type=False),
        nullable=True,
    ))
    op.create_check_constraint('ck_stress_level_range', 'stress_declarations', 'stress_level >= 1 AND stress_level <= 5')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('ck_stress_level_range', 'stress_declarations', type_='check')
    op.drop_column('stress_declarations', 'aria_state')
    op.drop_column('stress_declarations', 'simulation_phase')
    op.drop_column('stress_declarations', 'elapsed_seconds')
    op.drop_column('stress_declarations', 'task_id')
