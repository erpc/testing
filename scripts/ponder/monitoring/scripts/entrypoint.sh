#!/bin/bash

# Start Prometheus
/bin/prometheus --config.file=/etc/prometheus/prometheus.yml \
                --storage.tsdb.path=/prometheus \
                --web.listen-address=:9090 &

# Start Grafana
/usr/share/grafana/bin/grafana-server --homepath=/usr/share/grafana \
                                      --config=/etc/grafana/grafana.ini &

wait -n
