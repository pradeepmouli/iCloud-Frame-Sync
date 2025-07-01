FROM node:slim
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

ENV NODE_ENV=production
ENV LOG_LEVEL=info

EXPOSE 3000
CMD [ "npm", "start" ]
