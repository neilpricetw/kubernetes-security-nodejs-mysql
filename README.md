# Kubernetes Security Repo with a Basic NodeJS and MySQL Example

This repo has two examples of creating the same simple NodeJS / MySQL application running on Kubernetes.  The first in the insecure-original folder has no modifications and has various security flaws.  The second in the securely-modified folder has modications from the original to make it more secure and inline with best practices.   For details on how to build and deploy either check the README in the respective folders.

## List of Security Modifications

Below is a list of the security modifications we have made in the securely-modified folder and the reasons why.

1. Always patch your application



2. Never run containers as root or privileged mode
Why: 
if your container gets compromised then running as root or priviliged mode (removes most of the isolation provided by the container) makes it fairly easy for the hacker to break out of the container and gain full access to the host node, potentially the cluster, any kubernetes secrets and possibly all your data.  Once they have access to run commands on the host they could for example query the cluster API to create their own pods or write a key to /root/.ssh/authorized_keys on the host to gain remote access or worse.
Preventative Steps: 
- In securely-modified/node-app/Dockerfile ensure the last line defines the container to run as the node user
```
USER node
```
- In securely-modified/kubernetes-manifests/mysql.yaml set the security context to run the container as the mysql user
```
      securityContext:
        runAsUser: 999 # run as mysql user
        runAsGroup: 999 
```


3. Run containers using distroless or scratch images (applicable to node in this example)
Why:
If your container gets compromised then the distroless environment they have access to doesn't have bash or shell and a whole lot more which massively limits what the hacker can potentially do.  It also has the potential reduce the size of your image.  By default distroless images run as nonroot users.  You can add the :debug image tag which provides a busybox shell to enter when troubleshooting.  As far as I'm aware there is not a distroless image for mysql, here is the list of available images https://github.com/GoogleContainerTools/distroless.
Preventative Steps:
- In securely-modified/node-app/Dockerfile we've udpated it to have a build image which passes the contents to the stripped down distroless image.
```
FROM node:8.12.0-alpine AS build-env
RUN mkdir -p /opt/backend
ADD package.json /opt/backend
WORKDIR /opt/backend
RUN npm install
ADD . /opt/backend

FROM gcr.io/distroless/nodejs
COPY --from=build-env /opt/backend /app
WORKDIR /app
EXPOSE 3000
CMD ["index.js"]
```

4. Ideally remove bash shell from container and/or use hardened images (applicable to mariadb/mysql in this example)
Why:
To limit the hacker's options if the container gets compromised (similar to the Why for distroless).  The bash shell can be used to create a reverse shell for the hacker to gain access remotely.
Preventative Steps:
- In securely-modified/kubernetes-manifests/mysql.yaml commented out the security context relating to the user and updated the image to use a hardened image.  The user that the container runs as is not root but it's not clear who it is but it doesn't have root permissions.  The hardened image massively reduces the amount of vulnerabilities, see https://frontrow.rapidfort.com/app/community/imageinfo/docker.io%2Fbitnami%2Fmariadb/vulns/original.
```
      #securityContext:
      #  runAsUser: 999 # run as mysql user
      #  runAsGroup: 999    
      containers:
        - image: rapidfort/mariadb:latest
          name: mysql
          env:          
            - name: MARIADB_ROOT_PASSWORD
              value: password
```

5. Define a security context for the containers
Why: 
As per https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF
See book examples and add below
Preventative Steps:
- In securely-modified/kubernetes-manifests/node.yaml in lines 29-30 set allowPrivilegeEscalation to false
- In securely-modified/kubernetes-manifests/mysql.yaml in lines 69-70 set allowPrivilegeEscalation to false