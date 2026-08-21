"""add task_templates and extend tasks for task engine

Revision ID: ed0e586b6efd
Revises: fd0adc4fec33
Create Date: 2026-08-10 22:16:37.767934

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ed0e586b6efd'
down_revision: Union[str, Sequence[str], None] = 'fd0adc4fec33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Alembic's inline `sa.Enum(...)` always issues `CREATE TYPE` unconditionally
# (no checkfirst), so once a type exists we have to reference it with
# create_type=False instead of redeclaring it inline on every column.
tasktype_enum = postgresql.ENUM(
    'data_validation', 'document_organization', 'email_writing', 'urgent_request',
    name='tasktype', create_type=False,
)
priority_enum = postgresql.ENUM(
    'low', 'medium', 'high', 'urgent', name='priority', create_type=False,
)
taskdifficulty_enum = postgresql.ENUM(
    'easy', 'medium', 'hard', name='taskdifficulty', create_type=False,
)
sessionphase_enum = postgresql.ENUM(
    'accueil', 'montee_pression', 'pic_charge', 'debriefing',
    name='sessionphase', create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""

    # --- tasktype enum: French values -> English task-family values ---
    # Autogenerate doesn't diff enum members, so this has to be done by hand:
    # rename the old PG type out of the way, create the new one, cast the
    # existing tasks.type column across with an explicit value mapping, then
    # drop the old type.
    op.execute("ALTER TYPE tasktype RENAME TO tasktype_old")
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
                WHEN 'validation_donnees' THEN 'data_validation'
                WHEN 'classement_documents' THEN 'document_organization'
                WHEN 'redaction_courriel' THEN 'email_writing'
                WHEN 'demande_urgente' THEN 'urgent_request'
            END
        )::tasktype
        """
    )
    op.execute("DROP TYPE tasktype_old")

    # --- priority enum: {normal, urgent} -> {low, medium, high, urgent} ---
    # 'normal' has no direct equivalent in the new 4-level scale; mapped to
    # 'medium' since that's the new default priority.
    op.execute("ALTER TYPE priority RENAME TO priority_old")
    op.execute("CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'urgent')")
    op.execute(
        """
        ALTER TABLE tasks
        ALTER COLUMN priority TYPE priority
        USING (
            CASE priority::text
                WHEN 'normal' THEN 'medium'
                WHEN 'urgent' THEN 'urgent'
            END
        )::priority
        """
    )
    op.execute("DROP TYPE priority_old")

    # --- taskdifficulty enum: brand new ---
    op.execute("CREATE TYPE taskdifficulty AS ENUM ('easy', 'medium', 'hard')")

    op.create_table(
        'task_templates',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('task_type', tasktype_enum, nullable=False),
        sa.Column('difficulty', taskdifficulty_enum, nullable=False),
        sa.Column('phase', sessionphase_enum, nullable=False),
        sa.Column('estimated_duration', sa.Integer(), nullable=False),
        sa.Column('default_priority', priority_enum, nullable=True),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.add_column('tasks', sa.Column('template_id', sa.UUID(), nullable=True))
    op.add_column('tasks', sa.Column('difficulty', taskdifficulty_enum, nullable=True))
    op.add_column('tasks', sa.Column('instance_data', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('tasks', sa.Column('deadline_seconds', sa.Integer(), nullable=True))
    op.add_column('tasks', sa.Column('started_at', sa.DateTime(), nullable=True))
    op.add_column('tasks', sa.Column('time_taken_seconds', sa.Integer(), nullable=True))
    op.add_column('tasks', sa.Column('content_score', sa.Float(), nullable=True))
    op.create_foreign_key(None, 'tasks', 'task_templates', ['template_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'content_score')
    op.drop_column('tasks', 'time_taken_seconds')
    op.drop_column('tasks', 'started_at')
    op.drop_column('tasks', 'deadline_seconds')
    op.drop_column('tasks', 'instance_data')
    op.drop_column('tasks', 'difficulty')
    op.drop_column('tasks', 'template_id')
    op.drop_table('task_templates')

    op.execute("DROP TYPE taskdifficulty")

    # --- priority enum: revert to {normal, urgent} ---
    # Lossy: low/medium/high all collapse back to 'normal'.
    op.execute("ALTER TYPE priority RENAME TO priority_new")
    op.execute("CREATE TYPE priority AS ENUM ('normal', 'urgent')")
    op.execute(
        """
        ALTER TABLE tasks
        ALTER COLUMN priority TYPE priority
        USING (
            CASE priority::text
                WHEN 'urgent' THEN 'urgent'
                ELSE 'normal'
            END
        )::priority
        """
    )
    op.execute("DROP TYPE priority_new")

    # --- tasktype enum: revert to French values ---
    op.execute("ALTER TYPE tasktype RENAME TO tasktype_new")
    op.execute(
        "CREATE TYPE tasktype AS ENUM "
        "('validation_donnees', 'classement_documents', 'redaction_courriel', 'demande_urgente')"
    )
    op.execute(
        """
        ALTER TABLE tasks
        ALTER COLUMN type TYPE tasktype
        USING (
            CASE type::text
                WHEN 'data_validation' THEN 'validation_donnees'
                WHEN 'document_organization' THEN 'classement_documents'
                WHEN 'email_writing' THEN 'redaction_courriel'
                WHEN 'urgent_request' THEN 'demande_urgente'
            END
        )::tasktype
        """
    )
    op.execute("DROP TYPE tasktype_new")
