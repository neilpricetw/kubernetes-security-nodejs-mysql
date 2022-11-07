package main

import data.kubernetes

name = input.metadata.name

warn[msg] {
	kubernetes.is_deployment
    some container
    input_containers[container]    
	not container.resources.limits

	msg = sprintf("Containers should have resource limits in Deployment %s", [name])
}