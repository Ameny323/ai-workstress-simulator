import enum


class SessionPhase(str, enum.Enum):
    accueil = "accueil"
    montee_pression = "montee_pression"
    pic_charge = "pic_charge"
    debriefing = "debriefing"


class SessionStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"
    abandoned = "abandoned"


class TaskType(str, enum.Enum):
    data_validation = "data_validation"
    document_organization = "document_organization"
    email_writing = "email_writing"
    urgent_request = "urgent_request"


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    expired = "expired"


class TaskDifficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class ManagerTone(str, enum.Enum):
    bienveillant = "bienveillant"
    neutre = "neutre"
    exigeant = "exigeant"
    intrusif = "intrusif"


class RecommendationCategory(str, enum.Enum):
    gestion_temps = "gestion_temps"
    pause = "pause"
    communication = "communication"
    charge_travail = "charge_travail"
