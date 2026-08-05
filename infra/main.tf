terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type        = string
  default     = "us-central1"
}

variable "billing_account" {
  type        = string
  description = "Billing account ID for budget alerts (XXXXXX-XXXXXX-XXXXXX)"
  default     = ""
}

variable "chaos_admin_token" {
  type      = string
  sensitive = true
  default   = "change-me"
}

locals {
  services = [
    "run.googleapis.com",
    "aiplatform.googleapis.com",
    "pubsub.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "firestore.googleapis.com",
    "bigquery.googleapis.com",
    "storage.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "billingbudgets.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each                   = toset(local.services)
  project                    = var.project_id
  service                    = each.value
  disable_on_destroy         = false
  disable_dependent_services = false
}

resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.apis]
}

resource "google_bigquery_dataset" "sre_agents" {
  dataset_id                 = "sre_agents"
  friendly_name              = "SRE Agents traces"
  description                = "Immutable investigation traces and cost rows"
  location                   = var.region
  delete_contents_on_destroy = true
  depends_on                 = [google_project_service.apis]
}

resource "google_bigquery_table" "traces" {
  dataset_id = google_bigquery_dataset.sre_agents.dataset_id
  table_id   = "investigation_traces"
  schema = jsonencode([
    { name = "runId", type = "STRING", mode = "REQUIRED" },
    { name = "status", type = "STRING", mode = "NULLABLE" },
    { name = "scenario", type = "STRING", mode = "NULLABLE" },
    { name = "predicted", type = "STRING", mode = "NULLABLE" },
    { name = "expected", type = "STRING", mode = "NULLABLE" },
    { name = "costUsd", type = "FLOAT", mode = "NULLABLE" },
    { name = "tokensIn", type = "INTEGER", mode = "NULLABLE" },
    { name = "tokensOut", type = "INTEGER", mode = "NULLABLE" },
    { name = "project", type = "STRING", mode = "NULLABLE" },
    { name = "ingestedAt", type = "TIMESTAMP", mode = "NULLABLE" },
    { name = "targetService", type = "STRING", mode = "NULLABLE" },
    { name = "rootCause", type = "STRING", mode = "NULLABLE" },
    { name = "approvalDecision", type = "STRING", mode = "NULLABLE" },
    { name = "agentSteps", type = "INTEGER", mode = "NULLABLE" },
    { name = "toolCalls", type = "INTEGER", mode = "NULLABLE" },
    { name = "durationMs", type = "INTEGER", mode = "NULLABLE" },
    { name = "reportGcsUri", type = "STRING", mode = "NULLABLE" },
    { name = "region", type = "STRING", mode = "NULLABLE" },
    { name = "eventsJson", type = "STRING", mode = "NULLABLE" },
  ])
}

resource "google_storage_bucket" "artifacts" {
  name                        = "${var.project_id}-sre-agents-artifacts"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
  depends_on                  = [google_project_service.apis]
}

resource "google_pubsub_topic" "incidents" {
  name       = "sre-incidents"
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "incidents_dlq" {
  name = "sre-incidents-dlq"
}

resource "google_secret_manager_secret" "chaos_token" {
  secret_id = "chaos-admin-token"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "chaos_token" {
  secret      = google_secret_manager_secret.chaos_token.id
  secret_data = var.chaos_admin_token
}

# Optional paging secrets — create empty placeholders; populate versions out-of-band.
resource "google_secret_manager_secret" "slack_webhook" {
  secret_id = "slack-webhook-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "pagerduty_routing_key" {
  secret_id = "pagerduty-routing-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# Budget alerts at $20 and $40 (requires billing_account)
resource "google_billing_budget" "credits_20" {
  count           = var.billing_account != "" ? 1 : 0
  billing_account = var.billing_account
  display_name    = "gcp-sre-agents-$20"
  amount {
    specified_amount {
      currency_code = "USD"
      units         = "20"
    }
  }
  threshold_rules {
    threshold_percent = 1.0
  }
}

resource "google_billing_budget" "credits_40" {
  count           = var.billing_account != "" ? 1 : 0
  billing_account = var.billing_account
  display_name    = "gcp-sre-agents-$40"
  amount {
    specified_amount {
      currency_code = "USD"
      units         = "40"
    }
  }
  threshold_rules {
    threshold_percent = 1.0
  }
}

output "pubsub_topic" {
  value = google_pubsub_topic.incidents.name
}

output "bigquery_dataset" {
  value = google_bigquery_dataset.sre_agents.dataset_id
}

output "artifacts_bucket" {
  value = google_storage_bucket.artifacts.name
}

output "slack_webhook_secret" {
  value = google_secret_manager_secret.slack_webhook.secret_id
}

output "pagerduty_routing_key_secret" {
  value = google_secret_manager_secret.pagerduty_routing_key.secret_id
}
