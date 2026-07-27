# Optional Cloud Run + Monitoring alert wiring.
# Apply after container images are pushed (see README deploy section).

variable "patient_image" {
  type    = string
  default = ""
}

variable "api_image" {
  type    = string
  default = ""
}

variable "chaos_image" {
  type    = string
  default = ""
}

variable "web_image" {
  type    = string
  default = ""
}

resource "google_cloud_run_v2_service" "patient" {
  count    = var.patient_image != "" ? 1 : 0
  name     = "patient"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = var.patient_image
      env {
        name  = "APP_SECRET"
        value = "deployed-secret"
      }
      env {
        name  = "REQUIRED_CONFIG_KEY"
        value = "APP_SECRET"
      }
      env {
        name = "CHAOS_ADMIN_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.chaos_token.secret_id
            version = "latest"
          }
        }
      }
      ports {
        container_port = 8080
      }
    }
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_monitoring_uptime_check_config" "patient" {
  count        = var.patient_image != "" ? 1 : 0
  display_name = "patient-healthz"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/healthz"
    port         = 443
    use_ssl      = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(replace(google_cloud_run_v2_service.patient[0].uri, "https://", ""), "/", "")
    }
  }
}

resource "google_monitoring_alert_policy" "patient_uptime" {
  count        = var.patient_image != "" ? 1 : 0
  display_name = "patient-unhealthy"
  combiner     = "OR"
  conditions {
    display_name = "http_500s_or_uptime_fail"
    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "60s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }
    }
  }
  notification_channels = []
  documentation {
    content = "Pub/Sub topic ${google_pubsub_topic.incidents.name} should receive incident notifications for gcp-sre-agents."
  }
}
