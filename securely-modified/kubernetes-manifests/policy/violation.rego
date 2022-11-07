package main

import data.kubernetes

name = input.metadata.name

violation[msg] {
	kubernetes.is_deployment
    some container
    input_containers[container]    
	not container.securityContext

	msg = sprintf("Containers must have a securityContext in Deployment %s", [name])
}