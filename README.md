# Kubernetes Security Repo with a Basic NodeJS and MySQL Example

This repo has two examples of creating the same simple NodeJS / MySQL application running on Kubernetes.  The first in the insecure-original folder which has no modifications and has various security flaws.  The second in the securely-modified folder has modications from the original to make it more secure and inline with best practices.   For details on how to build and deploy either check out their READMEs ([insecure-original readme](https://github.com/neilpricetw/kubernetes-security-nodejs-mysql/blob/main/insecure-original/README.md), [securely-modified readme](https://github.com/neilpricetw/kubernetes-security-nodejs-mysql/blob/main/securely-modified/README.md)).

## List of Security Modifications

Below is a list of the security modifications I've made in the securely-modified folder and the reasons why.


### 1. Always scan and patch your application and image
__Why__:
This is the minimal viable security which should be implemented.  Hackers have plenty of online documentation and specialist tools that can exploit known vulnerabilities.  If you don't patch your application and images then they will remain in a known vulnerable state which could have been avoided. Low hanging fruit for a seasoned hacker! 
__Preventative Steps__:
You can use __dependabot__ which is built into Github or __[Trivy](https://github.com/aquasecurity/trivy)__ to scan for package dependency vulnerabilities.  Interestingly when comparing the two Trivy picked up more vulnerabilities than Dependabot (but Dependabot picked up one that Trivy didn't detect).  Trivy can also scan container images for vulnerabilities and can be run on the command line or in a CI/CD pipeline and if desired stop a build if high or critical CVEs are detected.
You can see in the [GitHub Action Code](https://github.com/neilpricetw/kubernetes-security-nodejs-mysql/blob/main/.github/workflows/securely-modified-ci.yaml) I am running Trivy against both the application code and then also against the image as it will pick up different vulnerabilities.



### 2. Never run containers as root or privileged mode
__Why__: 
If your container gets compromised then running as root or priviliged mode (removes most of the isolation provided by the container) making it fairly easy for the hacker to break out of the container and gain full access to the host node, potentially the cluster, any kubernetes secrets and possibly all your data.  Once they have access to run commands on the host they could for example query the cluster API to create their own pods or write a key to /root/.ssh/authorized_keys on the host to gain remote access or worse.  
__Preventative Steps__:
In securely-modified/node-app/Dockerfile I've added the following as the last line which defines the user that the container should run as.
```
USER node
```
In securely-modified/kubernetes-manifests/mysql.yaml I've set the security context to run the container as the mysql user.
```
      securityContext:
        runAsUser: 999 # run as mysql user
        runAsGroup: 999
        fsGroup: 2000
```


### 3. Run containers using distroless or scratch images (applicable to node in this example)
__Why__: 
The distroless images are a cut down version of the main image as it does not have bash or shell and many other unnecessary tools which when unavailable massively limits what the hacker can potentially do if your container gets compromised.  It also has the potential reduce the size of your image.  By default distroless images run as nonroot users.  You can add the :debug image tag which provides a busybox shell to enter when troubleshooting.  There are not distroless images for every scenario (there is no distroless image for mysql), [here](https://github.com/GoogleContainerTools/distroless) is the list of available images.  If you can't find a suitable distroless image then another option is using a scratch image although it's more complicated as you have to create everything from scratch.  
__Preventative Steps__:
In securely-modified/node-app/Dockerfile we've updated it to have a build image which passes the contents to the stripped down distroless image.
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


### 4. Ideally remove bash shell from container and/or use hardened images (applicable to mariadb/mysql in this example)
__Why__: 
Similar to the 'Why' for distroless, this is about limiting the hacker's options if the container gets compromised.  The bash shell can be used to create a reverse shell for the hacker to gain access remotely if it's available.
__Preventative Steps__:
In securely-modified/kubernetes-manifests/mysql.yaml I've commented out the security context relating to the user and updated the image to use a hardened image.  The user that the container runs as is not root but it's not clear who it is but I'm certain it doesn't have root permissions.  The hardened image massively reduces the amount of vulnerabilities, see https://frontrow.rapidfort.com/app/community/imageinfo/docker.io%2Fbitnami%2Fmariadb/vulns/original for the differences between a normal and hardened mariadb image.  I've left the hardened image commented out as the image was not compatible with the Mac M1 Chipset (I've confirmed the code works on [killercoda](https://killercoda.com/playgrounds/scenario/kubernetes)).
```
      #securityContext:
      #  runAsUser: 999 # run as mysql user
      #  runAsGroup: 999
      #  fsGroup: 2000   
      containers:
        - image: rapidfort/mariadb:latest
          name: mysql
          env:          
            - name: MARIADB_ROOT_PASSWORD
              value: password
```


### 5. Don't store secret data as container environment variables
__Why__: 
It's very common for containers to read environment variables for secret data perhaps to connect to a database.  If your container gets compromised then the environment variables are likely to be the first place they look so it makes sense to not store the data there and make it all to easy for the hacker.  Kubernetes provides secretRef and secretKeyRef options to add your secrets as environment variables but it is safer to store your secrets as files and have the values base64 encoded.  It's important to go to these extra lengths because you need to do the upmost to protect your data.
__Preventative Steps__:


### 6. Run kubesec against your manifest files
__Why__: 
Kubesec is a simple tool to validate the security of a kubernetes resources.  It returns a risk score for the resource, and advises on how to tighten the securityContext.  It's very east to use and can be built into a CI/CD pipeline is desired.
__Preventative Steps__:
Running the following will generate json output and a score for each.  The insecure file scored 0 whereas the secure file should be higher once we've applied the best practices.
```
docker run -i kubesec/kubesec:512c5e0 scan /dev/stdin < insecure-original/kubernetes-manifests/mysql.yaml
docker run -i kubesec/kubesec:512c5e0 scan /dev/stdin < securely-modified/kubernetes-manifests/mysql.yaml
```


### 7. Define security contexts and seccomp profiles for your containers
__Why__: 
So there are a whole series of best practice security tweaks you can make here that will reduce your attack surface area.


As per https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF
See book examples and add below  


Check if your pods are sharing the host’s IPC or network namespace. Sharing namespaces for pod and host interprocess communication may lead to opening access to shared information. Pods should not be allowed access to the host namespaces. 

And sharing pod and host network namespaces enables network access to the host network from the pod, which breaks network isolation. That’s why you better set the hostNetwork parameter to false in PodSecurityPolicy.

seccomp (see https://kubernetes.io/docs/tutorials/security/seccomp/) - Note: It is not possible to apply a seccomp profile to a container running with privileged: true set in the container's securityContext. Privileged containers always run as Unconfined. RuntimeDefault as the default seccomp profile: The default profiles aim to provide a strong set of security defaults while preserving the functionality of the workload.

__Preventative Steps__:
In securely-modified/kubernetes-manifests/node.yaml in lines 29-30 set allowPrivilegeEscalation to false
In securely-modified/kubernetes-manifests/mysql.yaml in lines 69-70 set allowPrivilegeEscalation to false
use kubesec, etc


### 8. Apply Pod Security Standards to your cluster or namespace
__Why__: 
Pod Security Standards replaces pod security policies (PSPs) which are now deprecated.  You can apply them at the cluster level which is usually a flag that needs to be enabled when the cluster service starts (see pod_security_adminission_controller.yaml in this code base for more info).  For more flexibility it's easier to apply it at the namespace level (see namespace.yaml).  This also helps to reduce the liklihood of using the default namespace which should be avoided and isolate workloads and services into their own namespaces which is a security best practice.  Once the Pod Security Standards have been applied either to your cluster or namespace then it will either audit, warn or enforce security standards which should help you make your platform more secure.
__Preventative Steps__:
To apply at the namespace see securely-modified/kubernetes-manifests/namespace.yaml also shown below which can be applied using kubectl.
```
apiVersion: v1
kind: Namespace
metadata:
  name: app
  labels:
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```


### 9. Apply container resource limits to CPU and Memory
__Why__: 
The main security reason to apply resource requests and limits to the containers is to limit the risks to your cluster if any of the containers were compromised.  In theory the hacker is resourced limited as opposed to consuming resources across your whole cluster and possibly bringing everything offline. 
__Preventative Steps__:
In securely-modified/kubernetes-manifests/node.yaml and securely-modified/kubernetes-manifests/mysql.yaml you'll see resource requests and limits applied to the containers.
```
          resources:
            requests:
              memory: "64Mi"
              cpu: "250m"
            limits:
              memory: "128Mi"
              cpu: "500m"
```


### 10. Use the container image sha256 hash to reference it 
__Why__: 
Sunburst / SolarWinds hack supply chain!
__Preventative Steps__:



### 11. Implement granular RBAC (least privilege)
__Why__: 
audit2rbac
__Preventative Steps__:



### 12. Run hadolint and conftest to ensure a Dockerfile confirms best practices
__Why__: 

__Preventative Steps__:


SELinux / AppArmour as part of SecurityContext?
Open Policy Agent?
kubehunter and ccat and dockerscan