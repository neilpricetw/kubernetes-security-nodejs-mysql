package main

import data.kubernetes

name = input.metadata.name

input_containers[container] {
  container := input.spec.template.spec.containers[_]
}

deny[msg] {
	kubernetes.is_deployment
    some container
    input_containers[container]    
	not container.securityContext.seccompProfile

	msg = sprintf("Containers must have a seccompProfile in Deployment %s", [name])
}

deny[msg] {
	kubernetes.is_deployment
    some container
    input_containers[container]    
	allowPrivilegeEscalation := container.securityContext.allowPrivilegeEscalation
    allowPrivilegeEscalation != false

	msg = sprintf("Containers must set allowPrivilegeEscalation to false in Deployment %s", [name])
}

deny[msg] {
	kubernetes.is_deployment
	hostNetwork := input.spec.template.spec.hostNetwork
    hostNetwork != false;

	msg = sprintf("hostNetwork should be false in Deployment %s", [name])
}
