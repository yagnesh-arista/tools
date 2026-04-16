#!/bin/bash
cluster="${AI_PROXY_CLUSTER:-infra}"
if [[ "$cluster" != "infra" ]]; then
    cat ~/.ai-proxy-api-key-${cluster}
else
    cat ~/.ai-proxy-api-key
fi
