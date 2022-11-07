# Kubernetes Security Best Practice Recommendations

This repo has two examples of creating the same simple NodeJS / MySQL application running on Kubernetes.  The first in the insecure-original folder has no modifications and does not follow best practices, it literally just deploys the application.  The second in the securely-modified folder has modications from the original to make it more secure and inline with best practices.

Below goes into detail about each of the best practice modifications I've made explaining why it's good to implement them and how to implement them.  You'll find that there isn't a simple Kubernetes switch to enable making it secure but instead multiple recommended but optional steps you can take to reduce the chance of being hacked and if compromised reduce the possible attack surface area.

For details on how to build and deploy either the insecure or secure solutions using minikube check out their READMEs ([insecure-original readme](https://github.com/neilpricetw/kubernetes-security-nodejs-mysql/blob/main/insecure-original/README.md), [securely-modified readme](https://github.com/neilpricetw/kubernetes-security-nodejs-mysql/blob/main/securely-modified/README.md)).

## List of Security Modifications

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


### 4. Ideally remove bash shell from containers and/or use hardened images (applicable to mariadb/mysql in this example)
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
It's very common for containers to read environment variables for secret data perhaps to connect to a database.  If your container gets compromised then the environment variables are likely to be the first place they look so it makes sense to not store secret data there which would make it too easy for the hacker.  Kubernetes provides secretRef and secretKeyRef options to add your kubernetes secrets as environment variables but it is safer still to store your secrets as files for the reason specified above.  It's important to go to these extra lengths because you need to do the upmost to protect your data.  

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
It references a new Kubernetes secret (see secrets.yaml) which needs to be applied to the cluster before the node.yaml is applied.  This secrets.yaml file should not have the actual values (secrets) hard coded in, there should be placeholders that get updated in the CI/CD pipeline which retrieves the secret data from a key safe or vault service and updates the values.  You will also need to change the application code to retrieve the data from the files and unencode them, see below in index.js:
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
Kubesec is a simple tool to validate the security of a kubernetes resources.  It returns a risk score for the resource, and advises on how to tighten security.  It's very easy to use and can be built into a CI/CD pipeline if desired.  

__Preventative Steps__:
Running the following will generate json output and a score for each.  The insecure file scored 0 whereas the secure file should be higher once we've applied the best practices.  Running the scan against the insecrure and the secure manifests you'll see a big difference.
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
As you've seen from the kubesec output it's best practice to apply multiple security context settings and a seccomp profile which all go towards limiting a hacker's options if the container gets compromised and will generally reduce the attack surface area.  Many of these recommendations and more can be found in the [NSA Kubernetes Hardening Guide](https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF) which includes descriptions for each setting and why you may wish to apply them.  [Seccomp](https://kubernetes.io/docs/tutorials/security/seccomp/) profiles can only be applied to containers that are not running in privileged mode.  One option is to set seccomp profile to RuntimeDefault which provides a strong set of security defaults while preserving the functionality of the workload.  

__Preventative Steps__:
In the container deployments manifest files (securely-modified/kubernetes-manifests/) I've added these lines:
```
    spec:
      hostPID: false # Controls whether containers can share host process namespace
      hostIPC: false # Controls whether containers can share host process namespace
      hostNetwork: false # Controls whether containers can use the host network 
```
and further down added a security context with a seccomp profile:
```
          securityContext:
            seccompProfile:
              type: RuntimeDefault # this seccomp profile provides a strong set of security defaults while preserving the functionality of the workload
            capabilities: # You should always drop all capabilities and only add those that your application needs to operate
              drop: # drop should always come before add
                - ALL       
            privileged: false # Controls whether pods can run privileged containers
            #runAsNonRoot: true # when running a distroless image and seccomp profile I've found that in this case I needed to disable it to get the container running
            readOnlyRootFilesystem: true # Requires the use of a read only root filesystem            
            allowPrivilegeEscalation: false # Restricts escalation to root privileges  
```
Interestingly for the node securityContext I had to comment out runAsNonRoot and for the mysql securityContext I had to comment out readOnlyRootFilesystem.  You'll find there will be tweaks needed depending on the container requirements.  These aren't all the securityContext fields, you can see more [here](https://kubernetes.io/docs/concepts/security/pod-security-standards/).


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
Pod Security Standards replaces pod security policies (PSPs) which are now deprecated.  You can apply them at the cluster level which is usually a flag that needs to be enabled when the cluster service starts (see pod-security-adminission-controller.yaml in this code base for more info).  For more flexibility it's easier to apply it at the namespace level (see namespace.yaml).  This also helps to reduce the liklihood of using the default namespace which should be avoided and isolate workloads and services into their own namespaces which is a security best practice.  Once the Pod Security Standards have been applied either to your cluster or namespace then it will either audit, warn or enforce security standards which should help you make your platform more secure.  

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


### 10. Run hadolint against your Dockerfiles
__Why__: 
Hadolint is a linting service that will provide best practice recommendations when reviewing your Dockerfile and it can easily be added into your CI/CD pipeline.
__Preventative Steps__:
It's easily run through Docker as per below:
```
docker run --rm -i hadolint/hadolint < insecure-original/node-app/Dockerfile
```
and the output:
```
-:4 DL3020 error: Use COPY instead of ADD for files and folders
-:10 DL3020 error: Use COPY instead of ADD for files and folders
```
Docker strongly recommends using COPY over ADD because as it's more transparent and restrictive in it's capabilities.


### 11. Apply container resource limits to CPU and Memory
__Why__: 
The main security reason to apply resource requests and limits to the containers is to limit the risks to your cluster if any of the containers were compromised.  In theory the hacker is resourced limited as opposed to consuming resources across your whole cluster and possibly bringing everything offline.  

__Steps__:
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


### 12. Reference container images by their sha256 hash
__Why__: 
The Sunburst SolarWinds supply chain hack was a very cleverly engineered attack.  I could spend 30 mins just talking about that.  In short the SolarWinds CI/CD pipeline was compromised, a hacker was able to add their own code into a legitimate trusted SolarWinds artifact that the pipeline creates.  The artifact was consumed by many large and small trusting organisations unwittingly creating a hole in their security.  The hacker also went back and fixed the pipeline and removed their code once SolarWinds customers had been infected.  There is much you can do in this space to harden your CI/CD pipelines like signing your artifacts.  One best practice is to not use latest or v1.1 tag names to reference images for your containers.  This is because these tags do not guarantee you are getting the image you expect, it could be modified.  Instead it's recommended that you reference the container images by their sha256 digests (if you have the image locally you can run docker images --digests to see the sha256 references) then there is 100% no doubt which image you are consuming.

__Preventative Steps__:
So for the mysql container I've updated it to this:
```
      containers:
        - image: mariadb@sha256:8040983db146f729749081c6b216a19d52e0973134e2e34c0b4fd87f48bc15b0 # this is a specific version of mariadb:10.5.8 
          name: mysql
```
For the node container I edited the Dockerfile as per below:
```
FROM node@sha256:d75742c5fd41261113ed4706f961a21238db84648c825a5126ada373c361f46e AS build-env
RUN mkdir -p /opt/backend
ADD package.json /opt/backend
WORKDIR /opt/backend
RUN npm install
ADD . /opt/backend

FROM gcr.io/distroless/nodejs@sha256:b23fd429ffdb078aabe6efb4378430105908e344445e7e76135c6a3b49ded9c8
COPY --from=build-env /opt/backend /app
WORKDIR /app
EXPOSE 3000
CMD ["index.js"]
```


### 13. Implement auditing and apply granular RBAC (least privilege)
__Why__: 
You may or may not be shocked to hear that auditing is not enabled out of the box.  This also includes managed Kubernetes clusters like EKS or AKS where you need to enable it.  Audit logs provide a comprehensive overview of everything happening in your cluster, allowing you to make informed decisions. It’s important to note that improperly configured audit logs can contain so much information that they’re impossible to use, so it’s important to make sure that your configuration gives you enough information to get the logs you need, but not so much that it’s overwhelming.  Some of the key information recorded in the audit logs are:
- User Information and Originating IP
- Information About Requests That Were Initiated and Executed
- Response Status of the Actions Performed
I've found these links useful in helping to understand and configure Kubernetes auditing([kubernetes.io - k8s auditing](https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/#advanced-audit), [signoz.io - k8s auditing](https://signoz.io/blog/kubernetes-audit-logs/) and [containiq.com - k8s auditing](https://www.containiq.com/post/kubernetes-audit-logs)).

Once auditing is enabled on your cluster there is a useful tool called [audit2rbac](https://github.com/liggitt/audit2rbac) which takes a Kubernetes audit log and username or service account as input, and generates RBAC role and binding objects that cover all the API requests made by that user.  This allows you to refine the permissions of users and service accounts to become least privilege.

__Preventative Steps__:
To enable an audit policy on my minikube cluster I've created securely-modified/kubernetes-manifests/audit-policy.yaml, this cannot be applied via kubectl, it needs to be created on the primary node of the cluster (/etc/kubernetes/audit-policy.yaml).  On minikube you need to ssh in first:
```
minikube ssh
```
Once ssh'd in to the primary node create the file in /etc/kubernetes.  Then you need to create audit.log in the following directory as per the following commands. This is where Kubernetes will save your audit logs.
```
sudo mkdir /var/log/kubernetes/ && cd /var/log/kubernetes/
sudo mkdir audit/ && sudo touch audit.log
```
Now you need to edit the kubernetes api server manifest by running the following:
```
sudo vi /etc/kubernetes/manifests/kube-apiserver.yaml
```
In this file add the following volume mounts:
```
volumeMounts:

- mountPath: /etc/kubernetes/audit-policy.yaml
     name: audit
     readOnly: true
- mountPath: /var/log/kubernetes/audit/audit.log
     name: audit-log
     readOnly: false
```
and the following volumes:
```
volumes:

 - hostPath:
      path: /etc/kubernetes/audit-policy.yaml
      type: File
   name: audit
 - hostPath:
      path: /var/log/kubernetes/audit/audit.log
      type: FileOrCreate
   name: audit-log
```
Lastly update the command section to enable auditing in your cluster and save the changes:
```
 --audit-policy-file=/etc/kubernetes/audit-policy.yaml
 --audit-log-path=/var/log/kubernetes/audit/audit.log
```
To test it run any kubectl command and then ssh back into minikube and see if there's contents recorded in /var/log/kubernetes/audit/audit.log.

To enable it in cloud services see [AWS](https://docs.aws.amazon.com/eks/latest/userguide/control-plane-logs.html), [GCP](https://cloud.google.com/kubernetes-engine/docs/how-to/audit-logging) and [Azure](https://learn.microsoft.com/en-gb/azure/aks/monitor-aks#configure-monitoring).

Now you have access to the audit logs you can send them to a SIEM / monitoring platform and also choose to use audit2rbac which will help you to refine the permissions you assign your users and service accounts to least privilege.  I struggled to get audit2rbac to work on my Mac so I downloaded and ran it inside a container (not efficient but for my own peace of mind I wanted to see it working).  I copied the audit log into the container and downloaded the correct audit2rbac package then ran the following:
```
./audit2rbac -f audit.log --user system:kube-scheduler
```
Which returned the recommended least privilege permissions for that user which you can then choose to apply to your cluster:
```
root@168039c36b12:/# ./audit2rbac -f audit.log --user system:kube-scheduler
Opening audit source...
Loading events...
Evaluating API calls...
Generating roles...
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  annotations:
    audit2rbac.liggitt.net/version: v0.9.0
  labels:
    audit2rbac.liggitt.net/generated: "true"
    audit2rbac.liggitt.net/user: system-kube-scheduler
  name: audit2rbac:system:kube-scheduler
  namespace: kube-system
rules:
- apiGroups:
  - ""
  resourceNames:
  - extension-apiserver-authentication
  resources:
  - configmaps
  verbs:
  - get
  - list
  - watch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  annotations:
    audit2rbac.liggitt.net/version: v0.9.0
  labels:
    audit2rbac.liggitt.net/generated: "true"
    audit2rbac.liggitt.net/user: system-kube-scheduler
  name: audit2rbac:system:kube-scheduler
rules:
- apiGroups:
  - ""
  resources:
  - namespaces
  - nodes
  - persistentvolumeclaims
  - persistentvolumes
  - pods
  verbs:
  - get
  - list
  - watch
- apiGroups:
  - apps
  resources:
  - replicasets
  - statefulsets
  verbs:
  - get
  - list
  - watch
- apiGroups:
  - policy
  resources:
  - poddisruptionbudgets
  verbs:
  - get
  - list
  - watch
- apiGroups:
  - storage.k8s.io
  resources:
  - csidrivers
  - storageclasses
  verbs:
  - get
  - list
  - watch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  annotations:
    audit2rbac.liggitt.net/version: v0.9.0
  labels:
    audit2rbac.liggitt.net/generated: "true"
    audit2rbac.liggitt.net/user: system-kube-scheduler
  name: audit2rbac:system:kube-scheduler
  namespace: kube-system
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: audit2rbac:system:kube-scheduler
subjects:
- apiGroup: rbac.authorization.k8s.io
  kind: User
  name: system:kube-scheduler
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  annotations:
    audit2rbac.liggitt.net/version: v0.9.0
  labels:
    audit2rbac.liggitt.net/generated: "true"
    audit2rbac.liggitt.net/user: system-kube-scheduler
  name: audit2rbac:system:kube-scheduler
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: audit2rbac:system:kube-scheduler
subjects:
- apiGroup: rbac.authorization.k8s.io
  kind: User
  name: system:kube-scheduler
Complete!
```
Obviously I recommend focusing on refining permissions on the users and service accounts that you create.  I'm uncertain about the consequences of refining the permissions on system users and accounts but it could help make it more secure (thorough testing is definitely required).


### 14. Run conftest against your manifest files
__Why__: 
[Conftest](https://www.conftest.dev/) is a utility to help you write tests against structured configuration data. For instance, you could write tests for your Kubernetes configurations, Tekton pipeline definitions, Terraform code, Serverless configs or any other structured data.  Conftest relies on the Rego language from Open Policy Agent for writing policies.  Open Policy Agent is a graduated project in the CNCF.  It's easy to run conftest either via docker or command line and add into your CI/CD pipeline, see [install documentation](https://www.conftest.dev/install/).
__Preventative Steps__:
To install conftest on your Mac run the following:
```
brew install conftest
```
To run it against the insecure kubernetes node manifest file:
```
cd securely-modified/kubernetes-manifests;
conftest test ../../insecure-original/kubernetes-manifests/node.yaml
```
which produces this output:
```
WARN - ../../insecure-original/kubernetes-manifests/node.yaml - main - Containers should have resource limits in Deployment node
FAIL - ../../insecure-original/kubernetes-manifests/node.yaml - main - Containers must have a seccompProfile in Deployment node
FAIL - ../../insecure-original/kubernetes-manifests/node.yaml - main - Containers must have a securityContext in Deployment node

10 tests, 7 passed, 1 warning, 2 failures, 0 exceptions
```
Then against the secure kubernetes manifest node file:
```
conftest test node.yaml
```
and the output:
```
10 tests, 10 passed, 0 warnings, 0 failures, 0 exceptions
```


## Other Recommendations Not Covered in Detail

kubehunter and ccat and dockerscan

SigNoz, an open source APM can monitor metrics, traces, and logs of your Kubernetes cluster. It is built to support OpenTelemetry natively, the open source standard for instrumenting cloud-native applications. 
https://github.com/SigNoz/signoz