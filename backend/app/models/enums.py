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
    validation_donnees = "validation_donnees"
    classement_documents = "classement_documents"
    redaction_courriel = "redaction_courriel"
    demande_urgente = "demande_urgente"


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    expired = "expired"


class Priority(str, enum.Enum):
    normal = "normal"
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
