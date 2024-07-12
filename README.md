# Open Data Hub Tools &amp; Extensions Companion

This application implements tools that can be useful to anyone working with Open Data Hub (ODH), Red Hat OpenShift AI (RHOAI), or even locally with Podman.

## Current Features

- S3 Buckets Management: browsing, creation, deletion
- S3 Objects Browser:
  - Single file upload, Multiple files uploads, Downloads
  - File preview
  - Model import from HuggingFace
- S3 Connection testing
- HuggingFace token testing

## Overview

Bucket Management:
![bucket-management](bucket-management.png)

Single File Upload to S3:
![upload-single](upload-single.png)

Multiple File Uploads to S3:
![upload-single](upload-single.png)

Model Import from HuggingFace:


## Deployment

A container image of the application is available at: `quay.io/rh-aiservices-bu/odh-tec:latest`

It can be imported as a custom workbench in ODH or RHOAI, used in a standard OpenShift Deployment, or launched locally with Podman.

### Configuration

- Connection to S3 information can be set as environment variables. When used as a workbench in ODH or RHOAI, you can simply attach a Data Connection to it, and the values will automatically picked up.
- If you don't attach a data connection or you are using the container in simple Deployment or locally, you can set the environment variables available [here](./backend/.env.example).
- In the above file, you will also find how to set you HuggingFace Token, as well as a parameter to control the maximum number of parallel file uploads or transfers.
- At anytime, you can modify those values in the **Settings** menu of the application. The new values are only valid for the time the container is running. No modifications are made to the original Data Connection or the Environment variables you set at startup.

## Development

- Requirements: NodeJS 18 minimum.
- From the root folder of the repo, run `npm install` to install all the required packages both for the frontend and the backend.
- Launch the application in development mode with `npm run dev`.
