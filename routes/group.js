var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var assert = require("assert");

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({
  extended:true
}));

router.get('/new-group', function (req, res, next) {
    let assignmentID = req.query.assignmentID;
    let assignmentDoc;
    let previousGroup;
    Promise.resolve().then(()=>{
        return service.group.findGroup(req.session.user._id, assignmentID);
    }).then((previousGroup_)=>{
        previousGroup = previousGroup_;
        if(!previousGroup) throw new UserError("no match group was found");
        return service.assignment.getAssignment(assignmentID);
    }).then((assignmentDoc_)=>{
        assignmentDoc = assignmentDoc_;
        if(!assignmentDoc) return Promise.reject(new UserError("assignment was not found"));
        return service.group.cancelAllRequest(assignmentDoc._id, req.session.user._id);
    }).then(()=>{
        return service.group.addPerson(assignmentDoc._id, null, req.session.user._id);
    }).then(()=>{
        // inform user has joined a new group
        service.messaging.addMessage(
            req.session.user._id.toString(),
            "<span>You have joined a new group</span>",
            1000*3600,
            {duration: 20000});
        // inform previous group member that someone has left
        for(let member of previousGroup.members){
            if(member.toString() === req.session.user._id.toString()) continue;
            service.messaging.addMessage(
                member.toString(),
                "<span>Some one has left your group</span>",
                1000*3600,
                {duration: 20000});
        }
    }).then(()=>{
        res.send({status: true});
    }).catch((err)=>{
        next(err);
    });
});

router.get('/show-groups/:assignment', function (req, res, next) {
    let assignment = req.params.assignment;
    service.group.getAllGroupsWithMember(assignment).then((groupList)=>{
        let groupPromise = [];
        for(let group of groupList){
            groupPromise.push(service.user.getUserNames(group.members).then((nameList)=>{
                return {id: group._id.toString(), members: nameList};
            }));
        }
        return Promise.all(groupPromise);
    }).then((list)=>{
        res.json({status:true, groups:list});
    }).catch((err)=>{
        next(err);
    })
});

//Change to use projection
router.get('/show-requests/:group', function (req, res, next) {
    let group = req.params.group;
    service.group.getAllRequest(group).then((list)=>{
        res.json({"status":"ok","requests":list});
    }).catch((err)=>{
        res.status(500).send({status: false, reason: err.message});
    })
});

router.post('/send-request', function (req, res, next) {
      let user = req.session.user._id;
      let group = req.body.group;
      let groupDoc;
      service.group.getGroup(group).then((groupDoc_)=>{
          groupDoc = groupDoc_;
          if(!groupDoc) throw new UserError("this group does not exist");
          // check if the user is already in this group
          let found = false;
          for(let member of groupDoc.members){
              if(member.toString() === req.session.user._id.toString()) found = true;
          }
          if(found) throw new UserError("you are in this group already");
          return service.group.addRequest(groupDoc._id, user, groupDoc.assignment);
      }).then((requestID)=>{
          // send message to all group members
          for(let member of groupDoc.members){
              service.messaging.addMessage(
                  member.toString(),
                  "<span>received new request to join your group" +
                  "<button class=\"btn-flat toast-action deep-orange-text darken-1 action-button\" " +
                  "action-get=\"/group/respond-request?requestID="+requestID.toString()+"\">accept</button>" +
                  "</span>",
                  1000*3600,
                  {duration: 9999999});
          }
      }).then(()=>{
          res.json({status: true});
      }).catch((err)=>{
          next(err);
      })
});


router.get('/respond-request', function (req, res, next) {
    let requestID = req.query.requestID;
    let accepted = req.query.accepted;
    let requestDoc;
    let groupDoc;
    let previousGroup;
    service.group.getRequest(requestID).then((request)=>{
        requestDoc = request;
        if(!request) throw new UserError("Request was not found");
        if(request.status !== "pending") throw new UserError("request state invalid");
        return service.group.getGroup(request.group);
    }).then((groupDoc_)=>{
        groupDoc = groupDoc_;
        assert(groupDoc, "Request was point to an non existed group");
        // ensure the responder is in the group
        let found = false;
        for(let member of groupDoc.members){
            if(member.toString() === req.session.user._id.toString()) found = true;
        }
        if(!found) throw new UserError("you are not permitted to perform this operation");
    }).then(()=>{
        // remove all related request
        return service.group.cancelAllRequest(groupDoc.assignment, requestDoc.requester);
    }).then(()=>{
        // get user's previous group info
        return service.group.findGroup(requestDoc.requester, groupDoc.assignment);
    }).then((groupInfo)=>{
        previousGroup = groupInfo;
        // add this person to the new group
        return service.group.addPerson(groupDoc.assignment, groupDoc._id, requestDoc.requester);
    }).then(()=>{
        // inform the change to everyone
        for(let member of groupDoc.members){
            service.messaging.addMessage(
                member.toString(),
                "<span>New user has joined your group</span>", // TODO: add some names
                1000*3600,
                {duration: 9999999});
        }
        service.messaging.addMessage(
            requestDoc.requester.toString(),
            "<span>You have joined a new group</span>",
            1000*3600,
            {duration: 9999999});
        // inform previous group member that someone has left
        for(let member of previousGroup.members){
            if(member.toString() === requestDoc.requester.toString()) continue;
            service.messaging.addMessage(
                member.toString(),
                "<span>Some one has left your group</span>",
                1000*3600,
                {duration: 20000});
        }
    }).then(()=>{
        res.send({status: true});
    }).catch((err)=>{
        next(err);
    });
});


module.exports = router;
