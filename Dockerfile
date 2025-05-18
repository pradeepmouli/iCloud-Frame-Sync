FROM denoland/deno:latest

WORKDIR /usr/app

# first copy just the package and the lock file, for caching purposes
COPY package.json ./
COPY package-lock.json ./

# install dependencies
RUN npm install

# copy the entire project
COPY . .

# build
RUN npm run build

EXPOSE 3000
CMD [ "npm", "start:deno" ]
