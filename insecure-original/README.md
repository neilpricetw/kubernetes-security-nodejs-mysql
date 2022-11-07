# Kubernetes Security Best Practice Recommendations

This folder has a simple NodeJS / MySQL application running on Kubernetes which has no security modifications and is not aligned to best practice but works as expected.

## Pre-requisites

- Have docker installed and running (or via colima if using a Mac)
- Install minikube as a local kubernetes platform to test on.
- start minikube and run the following to install nginx ingress and ensure that the docker images you build will be accessed by minikube

```
minikube start
minikube addons enable ingress
eval $(minikube -p minikube docker-env)
```

Note: if you don't wish to use minikube and don't have access to another Kubernetes platform there are two possible alternatives I'm aware of.  [Kind](https://kind.sigs.k8s.io/) which is run locally or [killercoda](https://killercoda.com/playgrounds/scenario/kubernetes) which provides an online kubernetes playground.

## Build and Deploy the Insecure-Original Application

Run the following to deploy this simple NodeJS / MySQL application:

```
cd insecure-original/node-app
docker build . -t node-app-insecure:v1
kubectl apply -f ../kubernetes-manifests/mysql.yaml
kubectl apply -f ../kubernetes-manifests/node.yaml
kubectl apply -f ../kubernetes-manifests/ingress.yaml
```

To access the application you have two options.  You can access it via the service which will provide a local URL you enter into the browser to see the application:

```
minikube service node --url
```

Or via the ingress you will need to edit your /etc/hosts file first and add in the following (this is needed on the Mac, unsure for other platforms).

```
127.0.0.1 isellstuffonline.local
```

Then on the terminal run the following, then you can access isellstuffonline.local in the browser.

```
minikube tunnel
```