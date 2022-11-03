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
If your container gets compromised then running as root or priviliged mode (removes most of the isolation provided by the container) making it fairly easy for the hacker to break out of the container and gain full access to the host node, potentially the cluster, any kubernetes secrets and possibly all your data.  Once they have access to run commands on the host they could for example query the cluster API to create their own pods or write a key to /root/.ssh/authorized_keys on the host to gain remote access or worse.  In security tip 7 further down we'll show you how to ensure privileged mode is prohibited through the security context. 
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
It's very common for containers to read environment variables for secret data perhaps to connect to a database.  If your container gets compromised then the environment variables are likely to be the first place they look so it makes sense to not store secret data there making it easy for the hacker.  Kubernetes provides secretRef and secretKeyRef options to add your kubernetes secrets as environment variables but it is safer to store your secrets as files for the reason specified above.  It's important to go to these extra lengths because you need to do the upmost to protect your data.  
__Preventative Steps__:
In securely-modified/kubernetes-manifests/node.yaml I removed this...
```
          env:
          - name: DB_USER
            value: root 
          - name: DB_PASSWORD 
            value: password 
          - name: DB_HOST
            value: mysql 
          - name: DB_NAME
            value: mysql 
```
and adding this code below to securely-modified/kubernetes-manifests/node.yaml.
```
          volumeMounts:
            - name: secrets-volume
              mountPath: /etc/node-details
      volumes:
        - name: secrets-volume
          secret:
            secretName: node-secrets              
```
It references a new Kubernetes secret (see secrets.yaml) which needs to be applied to the cluster before the node.yaml is applied.  This secrets.yaml file should not have the actual values (secrets) hard coded in, there should be placeholders that get updated in the CI/CD pipeline as it which retrieves the secret data from a key safe or vault service and updates the values.  You will also need to change the application code to retrieve the data from the files and unencode it, see below in index.js:
```
const con = mysql.createConnection({
  host: fs.readFileSync("/etc/node-details/host").toString(),
  user: fs.readFileSync("/etc/node-details/user").toString(),
  password: fs.readFileSync("/etc/node-details/pwd").toString(),
  database: fs.readFileSync("/etc/node-details/name").toString()
});
```

### 6. Run kubesec against your manifest files
__Why__: 
Kubesec is a simple tool to validate the security of a kubernetes resources.  It returns a risk score for the resource, and advises on how to tighten the securityContext.  It's very east to use and can be built into a CI/CD pipeline is desired.  
__Preventative Steps__:
Running the following will generate json output and a score for each.  The insecure file scored 0 whereas the secure file should be higher once we've applied the best practices.
```
docker run -i kubesec/kubesec:512c5e0 scan /dev/stdin < insecure-original/kubernetes-manifests/mysql.yaml
docker run -i kubesec/kubesec:512c5e0 scan /dev/stdin < securely-modified/kubernetes-manifests/mysql.yaml
```
Here's some example output:
```
[
  {
    "object": "Deployment/mysql.default",
    "valid": true,
    "message": "Passed with a score of 7 points",
    "score": 7,
    "scoring": {
      "advise": [
        {
          "selector": ".spec .serviceAccountName",
          "reason": "Service accounts restrict Kubernetes API access and should be configured with least privilege"
        },
        {
          "selector": "containers[] .securityContext .readOnlyRootFilesystem == true",
          "reason": "An immutable root filesystem can prevent malicious binaries being added to PATH and increase attack cost"
        },
        {
          "selector": ".metadata .annotations .\"container.seccomp.security.alpha.kubernetes.io/pod\"",
          "reason": "Seccomp profiles set minimum privilege and secure against unknown threats"
        },
        {
          "selector": ".metadata .annotations .\"container.apparmor.security.beta.kubernetes.io/nginx\"",
          "reason": "Well defined AppArmor policies may provide greater protection from unknown threats. WARNING: NOT PRODUCTION READY"
        },
        {
          "selector": "containers[] .securityContext .runAsUser -gt 10000",
          "reason": "Run as a high-UID user to avoid conflicts with the host's user table"
        }
      ]
    }
  }
]
```


### 7. Define security contexts and seccomp profiles for your containers
__Why__: 
As you've seen from the kubesec output it's best practice to apply multiple security context settings and a seccomp profile which all go towards limiting a hacker's options if the container is compromised and will generally reduce the attack surface area.  Many of these recommendations and more can be found in the [NSA Kubernetes Hardening Guide](https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF) which includes descriptions for each setting and why you may wish to apply them.  [Seccomp](https://kubernetes.io/docs/tutorials/security/seccomp/) profiles can only be applied to containers that are not running in privileged mode.  One option is to set seccomp profile to RuntimeDefault which provides a strong set of security defaults while preserving the functionality of the workload.
__Preventative Steps__:



### 8. Define AppArmor profiles for your containers
__Why__: 
There is some overlap with security context and specifically Linux capabilities but I feel that the AppArmor also offers you greater flexibility to get granular on restricting permissions inside a container.  Associating an AppArmor well designed profile with your container can definitely reduce the risk if your container gets compromised by a hacker.
__Preventative Steps__:
For AppArmor you need to ensure it's enabled on the cluster (you can check /sys/module/apparmor/parameters/enabled on each node to confirm this).  Then you can create a custom profile file (in this example called 'deny-write') and save it on all the Kubernetes nodes in directory /etc/apparmor.d.  This is just an example of the deny-write file below which prevents writing contents to the filesystem inside the container (which is easy to test).
```
#include <tunables/global>
profile deny-write flags=(attach_disconnected) {
  #include <abstractions/base>
file,
# Deny all file writes.
  deny /** w,
}
```
Once you've saved it on each node you can run the following which will add it into the AppArmor profiles.
```
/sbin/apparmor_parser --replace --write-cache /etc/apparmor.d/deny-write
```
You can verify it is in the AppArmor profiles list by running the following command.  You should see your profile in the output:
```
aa-status
```
Now you can add it into your container manifest file like below (in securely-modified/kubernetes-manifests/mysql.yaml and node.yaml I've replaced localhost/deny-write with runtime/default which is simply confirming AppArmor is enabled but is not actually applying any security profile because I couldn't get it working in minikube but it works on standard kubernetes clusters):
```
spec:
  selector:
    matchLabels:
      app: mysql
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: mysql
      annotations:
        container.apparmor.security.beta.kubernetes.io/mysql: localhost/deny-write
```
This may even prevent the container from running or if it does run you can test it by trying to write a file to the filesystem and you should get permission denied.  A good example of a more complex custom AppArmor profile which is commonly used can be found [here](https://github.com/containers/common/blob/main/pkg/apparmor/apparmor_linux_template.go).


### 9. Apply Pod Security Standards to your cluster or namespace
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


### 10. Apply container resource limits to CPU and Memory
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


### 11. Use the container image sha256 hash to reference it 
__Why__: 
Sunburst / SolarWinds hack supply chain!
__Preventative Steps__:



### 12. Implement granular RBAC (least privilege)
__Why__: 
audit2rbac
__Preventative Steps__:



### 13. Run hadolint and conftest to ensure a Dockerfile confirms best practices
__Why__: 

__Preventative Steps__:


Open Policy Agent?
kubehunter and ccat and dockerscan