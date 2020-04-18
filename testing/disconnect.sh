#/bin/sh

. ./token-test

curl --verbose -k -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $BEARER_TOKEN" https://localhost:3000/action --data-binary @disconnect.json


