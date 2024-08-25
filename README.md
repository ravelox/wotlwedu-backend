# wotlwedu

## What is wotlwedu?

*wotlwedu* (What'll We Do?) is an intersection between "Wheel of Lunch" and "Survey Monkey".

When you're stuck making a decision, the idea is that you can create a list of items for your friends to vote on. Those items can be anything such as places to go, meals to eat, movies to watch or cocktails to try.
In wotlwedu, we call those elections. 

You can attach an image to the item or an election to add some visual inspiration.
You can also share an image, item or list with one of your friends and they can share the same with their friends.

For some details, take a look at the blog post at https://www.raveloxprojects.com/blog/?p=892

## What is wotlwedu-backend?

This is the REST API server for wotlwedu to provide an interface for **wotlwedu-frontend** and **wotlwedu-minimal**. The code repositories for both those interfaces are https://github.com/ravelox/wotlwedu-frontend and https://github.com/ravelox/wotlwedu-minimal

More details can be found at https://www.raveloxprojects.com/blog/?p=892 https://www.raveloxprojects.com/blog/?p=911.

This API is currently written to talk with a **mariadb** database.

## How is wotlwedu-backend installed?

**wotlwedu-backend** is an NodeJS app so there are a few steps to take and it depends on how you want to deploy it.

### Manual build
1. Install **nodejs** and make sure that **npm** is in your path. Which version you choose to is down to you and so the install instructions will be either available at https://nodejs.org or your platform's package repository.
  
2. Clone this git repository

    `git clone https://github.com/ravelox/wotlwedu-backend.git`

3. Change directory to the checked out repository

    `cd wotlwedu-minimal`

4.  Install the npm packages required by this app. For those not familiar with NodeJS, the package versions are listed in the **packages.json** file. This step may take some time to complete as each package has their own dependencies that they need to download.

    `npm install`

5. Before running the backend, you will need to initialise the database. You need a mariadb server running somewhere, it doesn't have to be a local instance. The instructions for installing mariadb are out of scope for this so please look at your platform's documentation. When a database server is available, you can use the script **docker-entrypoint.sh** to check for the **wotlwedu** database and initialise it if the database doesn't exist. While this script is intended for a Docker container, it can still be run from the command line. You **must** have a number of environment variables present to configure the database information: **WOTLWEDU_DB_HOST**, **WOTLWEDU_DB_USER**, **WOTLWEDU_DB_NAME** and **WOTLWEDU_DB_PASSWORD**. Note that unless you hard-code these values (instructions later), you will need to make sure that these variables are present **every time** you run **wotlwedu-backend**.
6. When the script has finished running, it will have initialised the database and populated it with some dummy users and some basic data. These can be deleted at a later time. The script will call **npm start** to run the backend. Logging output 
7. An admin user is created with the email address **root@localhost.localdomain** and password of **WombatFridgeBucket** (no spaces, capitalisation for each word).
8. If you want to run the app from a different script, NodeJS are typically called by using the command

    `ndoe app`
   Where **app* is the name of the main app file. In this case, **wotlwedu-backend** *is* using a file called **app.js**.
9. At present, **wotlwedu-backend** is written to use AWS SES and so there are additional environment variables that are needed to be set before that functionality can be used. **AWS_ACCESS_KEY_ID** and **AWS_SECRET_ACCESS_KEY**. These are **always** set up outside of the code to avoid security issues.
10. The file **config/wotlwedu.js** contains more settings that can be configured. If you are running your own **wotlwedu-backend** and **wotlwedu-frontend** or **wotlwedu-minimal**, you will need to change **WOTLWEDU_API_URL** and **WOTLWEDU_FRONTEND_URL** to use your own URLs.
11. For authentication, you **must** set the environment variable **WOTLWEDU_JWT_SECRET**. This is used to sign JWTs between the backend and the frontend. The value of this variable can be any string, "supersecretkey", "wotlweduisgreat", "a76b4fg!4mm09x))", for example but **must not** be hardcoded for security reasons.
12. If TLS communication is needed between the frontend and the backend, the environment variable **WOTLWEDU_SSL** must be set to "true" and the variables **WOTLWEDU_SSL_KEY** and **WOTLWEDU_SSL_CERT** should be present to point the key file and certificate files respectively.
   

### Docker build ###
A **Dockerfile** is provided in the repository. Additionally, the file **docker-entrypoint.sh** is required for the build. This file should be reviewed. By default, port **9876** is exposed. The docker container is **not** created to use SSL because this can be configured at runtime. It is not advisable to run this without SSL enabled.
To build the Docker image, run the following command in the wotlwedu-backend repository directory:
  `docker build --no-cache -t ravelox/wotlwedu-backend .`

A **docker compose** file is also available as **wotlwedu-backend.compose.yaml**. This file should be reviewed for the required environment variables. It should be noted that the compose file requires a directory **/secrets/wotlwedu-backend** to be available on the **host** machine to hold the SSL certificate and key **and** a file called **secrets.env** which will hold the initialisation for other variables such as **WOTLWEDU_JWT_SECRET**.

When you have the Docker container image created, you can use the compose file to start a container:

  `docker compose -f wotlwedu-backend.compose.yaml up -d`

This creates 2 containers. ! for the mariadb and 1 for the **wotlwedu-backend** instance.

