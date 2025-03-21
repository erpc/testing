FROM prom/prometheus:v2.37.0 as prometheus
FROM grafana/grafana:latest as grafana

FROM ubuntu:22.04

RUN apt-get update && apt-get install -y curl

# Copy Prometheus files
COPY --from=prometheus /bin/prometheus /bin/prometheus
COPY --from=prometheus /bin/promtool /bin/promtool
COPY prometheus/prometheus.yml /etc/prometheus/prometheus.yml
COPY prometheus/alert.rules /etc/prometheus/alert.rules

# Copy Grafana files
COPY --from=grafana /usr/share/grafana /usr/share/grafana
COPY --from=grafana /etc/grafana /etc/grafana
COPY prometheus /etc/prometheus
COPY grafana/grafana.ini /etc/grafana/grafana.ini
COPY grafana/datasources/prometheus.yml /etc/grafana/provisioning/datasources/prometheus.yml
COPY grafana/datasources/postgres.yml /etc/grafana/provisioning/datasources/postgres.yml
COPY grafana/datasources/loki.yml /etc/grafana/provisioning/datasources/loki.yml
COPY grafana/dashboards/default.yml /etc/grafana/provisioning/dashboards/default.yml
COPY grafana/dashboards/grafana.json /etc/grafana/provisioning/dashboards/grafana.json

# Set up entrypoint script
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000 9090

ENTRYPOINT ["/entrypoint.sh"]