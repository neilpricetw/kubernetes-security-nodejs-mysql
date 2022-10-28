# Kubernetes Security Repo with a Basic NodeJS and MySQL Example

This repo has two examples of creating the same simple NodeJS / MySQL application running on Kubernetes.  The first in the insecure-original folder has no modifications and has various security flaws.  The second in the securely-modified folder has modications from the original to make it more secure and inline with best practices.   For details on how to build and deploy either check the README in the respective folders.

## List of Security Modifications

Below is a list of the security modifications we have made in the securely-modified folder and the reasons why.

1. __Always scan and patch your application and image__
_Why_:
This is the minimal viable security which should be implemented.  Hackers have plenty of online documentation and specialist tools that can exploit known vulnerabilities.  If you don't patch your application and images then they will remain in a known vulnerable state which could have been avoided.  
_Preventative Steps_:
Use with dependabot which is built into Github or Trivy (https://github.com/aquasecurity/trivy) to scan for package dependency vulnerabilities.  Trivy can also scan container images for vulnerabilities and can be run on the command line or in a CI/CD pipeline and stop a build if high or critical CVEs are detected.

2. __Never run containers as root or privileged mode__
_Why_:
If your container gets compromised then running as root or priviliged mode (removes most of the isolation provided by the container) makes it fairly easy for the hacker to break out of the container and gain full access to the host node, potentially the cluster, any kubernetes secrets and possibly all your data.  Once they have access to run commands on the host they could for example query the cluster API to create their own pods or write a key to /root/.ssh/authorized_keys on the host to gain remote access or worse.
_Preventative Steps_:
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


3. __Run containers using distroless or scratch images (applicable to node in this example)__
_Why_:
If your container gets compromised then the distroless environment they have access to doesn't have bash or shell and a whole lot more which massively limits what the hacker can potentially do.  It also has the potential reduce the size of your image.  By default distroless images run as nonroot users.  You can add the :debug image tag which provides a busybox shell to enter when troubleshooting.  As far as I'm aware there is not a distroless image for mysql, here is the list of available images https://github.com/GoogleContainerTools/distroless.
_Preventative Steps_:
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

4. __Ideally remove bash shell from container and/or use hardened images (applicable to mariadb/mysql in this example)__
_Why_:
To limit the hacker's options if the container gets compromised (similar to the Why for distroless).  The bash shell can be used to create a reverse shell for the hacker to gain access remotely.
_Preventative Steps_:
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

5. __Define a security context for the containers__
_Why_: 
As per https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF
See book examples and add below
_Preventative Steps_:
- In securely-modified/kubernetes-manifests/node.yaml in lines 29-30 set allowPrivilegeEscalation to false
- In securely-modified/kubernetes-manifests/mysql.yaml in lines 69-70 set allowPrivilegeEscalation to false