# AI Work Stress Simulator

Plateforme interactive de sensibilisation à l'aliénation numérique — simulation immersive d'une journée de travail sous la supervision d'une IA managériale.

![Status](https://img.shields.io/badge/status-in%20development-yellow)
![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![Node](https://img.shields.io/badge/node-18%2B-green)

## Table des matières

- [Contexte](#contexte)
- [Objectifs](#objectifs)
- [Fonctionnement](#fonctionnement)
- [Modules fonctionnels](#modules-fonctionnels)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Variables d'environnement](#variables-denvironnement)
- [Utilisation](#utilisation)
- [Structure du dépôt](#structure-du-dépôt)
- [Méthodologie et feuille de route](#méthodologie-et-feuille-de-route)
- [Livrables](#livrables)
- [Limites et contraintes](#limites-et-contraintes)
- [Équipe](#équipe)
- [Références](#références)
- [Licence](#licence)

## Contexte

L'intégration croissante de l'intelligence artificielle dans l'environnement de travail soulève des questions majeures sur le bien-être des salariés. Les systèmes de surveillance algorithmique, les chatbots managériaux et l'automatisation des tâches créent une pression inédite pouvant conduire à l'aliénation numérique : un état de déshumanisation du travail où l'employé se sent réduit à un simple exécutant sous le contrôle permanent d'une machine.

Ce projet propose une plateforme de simulation permettant de vivre, de manière contrôlée, une expérience de travail sous supervision d'une IA, afin de faire prendre conscience des mécanismes de pression algorithmique et de mesurer objectivement leur impact.

## Objectifs

**Objectif principal**

Concevoir et développer une plateforme web interactive simulant une journée de travail sous supervision d'une IA, capable de mesurer l'impact psychologique et cognitif de la pression algorithmique sur l'utilisateur, et de fournir un rapport d'analyse avec des recommandations actionnables.

**Objectifs secondaires**

- Développer un bureau virtuel immersif avec tableau de bord, notifications et tâches dynamiques.
- Implémenter un chatbot manager IA capable d'adapter son comportement aux performances de l'utilisateur.
- Construire un module d'analyse comportementale mesurant le temps d'exécution, la productivité et la charge cognitive.
- Générer des rapports finaux visuels avec graphiques et conseils personnalisés.
- Assurer une expérience utilisateur fluide et accessible sur navigateur web standard.

## Fonctionnement

L'utilisateur se connecte à la plateforme et démarre une session de simulation représentant une journée de travail type. Le système présente un bureau virtuel composé d'un tableau de bord, d'une messagerie interne et d'une file de tâches dynamiques (validation de données, classement de documents, rédaction de courriels, réponses à des demandes urgentes). Chaque action est chronométrée et enregistrée.

En parallèle, un manager IA interagit en permanence avec l'utilisateur via des notifications et des messages directs, et adapte son comportement selon les performances observées : augmentation de la fréquence des rappels, réduction des délais, ajout de tâches prioritaires. Le système mesure en continu le temps de réponse, le taux d'erreurs, la vitesse de décroissance de la productivité et la charge cognitive estimée.

À tout moment, l'utilisateur peut déclarer son niveau de stress via une échelle visuelle. En fin de session, un rapport complet est généré avec un score de fatigue numérique, des graphiques détaillés et des recommandations personnalisées.

## Modules fonctionnels

| Module | Description |
|---|---|
| **1. Bureau virtuel** | Tableau de bord des tâches et délais, système de notifications, génération dynamique de tâches, panneau de messagerie. |
| **2. Manager IA** | Chatbot connecté à une API de langage, communication en temps réel via WebSockets, comportement à états évoluant du mode bienveillant au mode exigeant. |
| **3. Analyse comportementale** | Collecte des métriques d'interaction (temps, erreurs, pauses, frappe), calcul de l'indice de productivité, de la charge cognitive et de la courbe de fatigue. |
| **4. Rapport final** | Score global de stress numérique, graphiques d'évolution, recommandations personnalisées, export PDF. |

## Stack technique

| Composant | Technologies |
|---|---|
| Frontend | React 18+, TypeScript, Tailwind CSS, Chart.js / Recharts |
| Backend | Python 3.10+, FastAPI, WebSockets (Socket.IO) |
| IA / Manager virtuel | OpenAI API (GPT-4), prompt engineering adaptatif |
| Base de données | PostgreSQL, SQLAlchemy ORM |
| Authentification | JWT, OAuth2 (optionnel) |
| Déploiement | Docker, Docker Compose, Nginx |
| Versionnage | Git, GitHub, GitHub Projects |

L'algorithme central du manager IA repose sur un système de prompt engineering adaptatif : à chaque interaction, le backend compile un contexte à partir des métriques récentes de l'utilisateur (temps moyen de réponse, taux d'erreur, stress déclaré) et l'injecte dans le prompt du LLM. Une machine à états finis orchestre les transitions entre les phases de la simulation : accueil, montée en pression, pic de charge et débriefing final.

## Architecture

```
┌─────────────┐        WebSocket / REST        ┌──────────────┐
│   Frontend   │ <-----------------------------> │   Backend    │
│  React + TS  │                                  │   FastAPI    │
└─────────────┘                                  └──────┬───────┘
                                                          │
                                   ┌──────────────────────┼──────────────────────┐
                                   │                       │                      │
                             ┌─────▼─────┐          ┌─────▼─────┐         ┌──────▼──────┐
                             │ PostgreSQL │          │ OpenAI API │         │  Analytics   │
                             │  (sessions,│          │ (manager   │         │   Engine     │
                             │   métriques)│          │  IA)       │         │ (métriques)  │
                             └───────────┘          └───────────┘         └─────────────┘
```

## Prérequis

**Matériel**

- Processeur i5 ou supérieur (i7 recommandé)
- 16 Go de RAM minimum
- 20 Go d'espace disque disponible
- Connexion Internet stable (appels API OpenAI)

**Logiciel**

- Windows 10/11, macOS 12+ ou Ubuntu 22.04+
- Node.js 18+ et npm / yarn / pnpm
- Python 3.10+ avec pip et venv / conda
- Docker Desktop et Docker Compose
- Git et compte GitHub
- Clé API OpenAI valide

## Installation

Cloner le dépôt :

```bash
git clone https://github.com/<organisation>/ai-work-stress-simulator.git
cd ai-work-stress-simulator
```

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows : venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

**Avec Docker (recommandé)**

```bash
docker compose up --build
```

L'application est ensuite accessible sur `http://localhost:3000` (frontend) et `http://localhost:8000` (API backend).

## Variables d'environnement

Créer un fichier `.env` à la racine du backend :

```env
DATABASE_URL=postgresql://user:password@localhost:5432/ai_stress_simulator
OPENAI_API_KEY=your_openai_api_key
JWT_SECRET=your_jwt_secret
CORS_ORIGINS=http://localhost:3000
```

## Utilisation

1. Créer un compte ou se connecter à la plateforme.
2. Démarrer une nouvelle session de simulation.
3. Interagir avec les tâches proposées et les messages du manager IA.
4. Déclarer son niveau de stress à tout moment via l'échelle intégrée.
5. Consulter le rapport final en fin de session (score, graphiques, recommandations).

## Structure du dépôt

```
.
├── backend/
│   ├── app/
│   │   ├── api/            # Endpoints REST et WebSocket
│   │   ├── core/           # Configuration, sécurité
│   │   ├── models/         # Modèles SQLAlchemy
│   │   ├── services/       # Logique métier (manager IA, analyse)
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/     # Bureau virtuel, messagerie, tâches
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── services/       # Client API / WebSocket
│   ├── package.json
│   └── Dockerfile
├── docs/                   # Cahier des charges, spécifications, poster
├── docker-compose.yml
└── README.md
```

## Méthodologie et feuille de route

Le projet suit une méthodologie Agile (Scrum) avec des sprints de deux semaines.

| Sprint | Contenu |
|---|---|
| Sprint 1 | Mise en place de l'architecture, configuration de l'environnement (Docker, base de données), bureau virtuel minimal (Module 1). |
| Sprint 2 | Intégration du chatbot manager IA (Module 2) avec l'API OpenAI et les WebSockets. |
| Sprint 3 | Module d'analyse comportementale et graphiques en temps réel (Module 3). |
| Sprint 4 | Rapport final (Module 4), tests d'intégration, optimisation UX/UI, préparation de la démonstration. |
| Sprints finaux | Tests utilisateurs, correction des bugs, rédaction du rapport technique et du poster scientifique. |

## Livrables

- Application fonctionnelle déployée avec les quatre modules opérationnels.
- Dépôt GitHub documenté (README, instructions d'installation, CI/CD).
- Rapport technique décrivant l'architecture, les choix techniques et les résultats.
- Vidéo de démonstration (5 à 10 minutes).
- Poster scientifique.

## Limites et contraintes

- La simulation ne constitue pas un diagnostic médical du stress ; les mesures sont indicatives et basées sur des proxies comportementaux, non sur des signaux physiologiques.
- Les réponses du manager IA dépendent de la qualité du prompt engineering et peuvent parfois sembler peu naturelles.
- Une version immersive en 3D (Unreal Engine 5) nécessiterait des compétences spécifiques et allongerait significativement le développement ; elle n'est pas incluse dans le périmètre du stage.
- Les coûts d'utilisation de l'API OpenAI doivent être surveillés, notamment en phase de tests intensifs.
- La généralisabilité des résultats reste limitée par le caractère artificiel et la durée réduite de la simulation.

## Équipe

| Rôle | Responsabilités |
|---|---|
| Dev IA / Backend | FastAPI, intégration API OpenAI, analyse comportementale |
| Dev Frontend / UX | React, interface utilisateur, graphiques |
| Spécialiste UX/UI *(optionnel)* | Design d'interface, tests utilisateurs |
| Spécialiste 3D / Multimédia *(optionnel)* | Unreal Engine, reconnaissance vocale |

Projet réalisé dans le cadre d'un stage d'été — Cycle Ingénieur, ESPRIT (2025-2026).

## Références

- Brynjolfsson, E. et al. (2023). *How Will AI Transform Work? Here Are 5 Possibilities.* Harvard Business Review.
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
- [Recharts Documentation](https://recharts.org/)

## Licence

Ce projet est distribué sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.
