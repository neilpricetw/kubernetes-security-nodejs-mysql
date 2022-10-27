# Kubernetes Security Repo with a Basic NodeJS and MySQL Example

This repo has two examples of creating the same simple NodeJS / MySQL application running on Kubernetes.  The first in the insecure-original folder has no modifications and has various security flaws.  The second in the securely-modified folder has modications from the original to make it more secure and inline with best practices.   For details on how to build and deploy either check the README in the respective folders.

## List of Security Modifications

Below is a list of the security modifications we have made in the securely-modified folder and the reasons why.

1. Never run containers as root or privileged mode
Why: 
if your container gets compromised then running as root or priviliged mode (removes most of the isolation provided by the container) makes it fairly easy for the hacker to break out of the container and gain full access to the cluster, any kubernetes secrets and possibly your data.  Once the have access to run commands on the host they could for example write a key to /root/.ssh/authorized_keys on the host to gain remote access or worse.
What's Changed: 
- In securely-modified/node-app/Dockerfile ensure the last line defines the container to run as the node user 
- In securely-modified/kubernetes-manifests/mysql.yaml in lines 55-56 set the security context to run the container as the mysql user
- In securely-modified/kubernetes-manifests/node.yaml in lines 29-30 set allowPrivilegeEscalation to false
- In securely-modified/kubernetes-manifests/mysql.yaml in lines 69-70 set allowPrivilegeEscalation to false