import json
import sys
from datetime import datetime
import os

def convert_to_prom_format(input_file, variant_name):
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    metrics = []
    timestamp = int(datetime.now().timestamp() * 1000)
    
    # Extract relevant metrics from k6 JSON
    metrics_to_track = [
        'http_req_duration',
        'http_reqs',
        'iterations',
        'data_received',
        'data_sent'
    ]
    
    for metric in metrics_to_track:
        if metric in data['metrics']:
            value = data['metrics'][metric]['values']['avg']
            metrics.append(f'k6_test{{variant="{variant_name}",metric="{metric}"}} {value} {timestamp}')
    
    return metrics

def main():
    if len(sys.argv) != 3:
        print("Usage: python convert-to-prom.py <input_json> <variant_name>")
        sys.exit(1)
        
    input_file = sys.argv[1]
    variant_name = sys.argv[2]
    
    metrics = convert_to_prom_format(input_file, variant_name)
    
    # Write to output file
    output_dir = "data/prometheus"
    os.makedirs(output_dir, exist_ok=True)
    
    with open(f"{output_dir}/k6_metrics.prom", "a") as f:
        for metric in metrics:
            f.write(metric + "\n")

if __name__ == "__main__":
    main() 