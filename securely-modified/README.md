# Kubernetes Security Repo with a Basic NodeJS and MySQL Example

This repo has two examples of creating the same simple NodeJS / MySQL application running on Kubernetes.  The first in the insecure-original folder has no modifications and has various security flaws.  The second in the securely-modified folder has modications from the original to make it more secure and inline with best practices. 

## Pre-requisites

- Have docker installed and running (or via colima if using a Mac)
- Install minikube as a local kubernetes platform to test on.
- start minikube and run the following to install nginx ingress and ensure that the docker images you build will be accessed by minikube

```
minikube addons enable ingress
eval $(minikube -p minikube docker-env)
```

Note: two possible alternatives to minikube are [Kind](https://kind.sigs.k8s.io/) which is still run locally or [killercoda](https://killercoda.com/playgrounds/scenario/kubernetes) which provides an online kubernetes playground.

## Build and Deploy the Insecure-Original Application

Run the following:

```
cd insecure-original/node-app
docker build . -t node-app-secure:v1
kubectl apply -f ../kubernetes-manifests/mysql.yaml
kubectl apply -f ../kubernetes-manifests/node.yaml
kubectl apply -f ../kubernetes-manifests/ingress.yaml
```

To access the application you have two options, via the service which will provide a local URL you enter into the browser to see the application:

```
minikube service node --url
```

Or via the ingress you will need to edit your /etc/hosts file first and add in the following (this is needed on the Mac, unsure for other platforms) 

```
127.0.0.1 minikube.local
```

Thenon the terminal run the following and then access minikube.local in the browser

```
minikube tunnel
```