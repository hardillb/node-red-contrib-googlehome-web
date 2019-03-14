#!/bin/sh

mongod --noauth

mongo --host localhost --port 27017 

use admin
# db.createUser(
#   {
#     user: "admin",
#     pwd: "password",
#     roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
#   }
# )


# use admin
# db.createUser(
#     {
#       user: "root",
#       pwd: "password",
#       roles: [ "root" ]
#     }
# )

# use admin
# db.createUser(
#     {
#       user: "webapp",
#       pwd: "password",
#       roles: [ {"role": readwrite", "db": "assistant"} ]
#     }
# )


# db.getSiblingDB("assistant").createUser({
# 	user: 'mosquitto',
# 	pwd: 'password',
# 	roles: [
# 		{role: 'read', db:'assistant'}
# 	]
# })
# db.getSiblingDB("assistant").createUser({
# 	user: 'webapp',
# 	pwd: 'password',
# 	roles: [
# 		{role: 'readWrite', db:'assistant'}
# 	]
# })