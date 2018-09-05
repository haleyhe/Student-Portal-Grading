const assert = require('assert');
const mongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

let groupColl;
let requestColl;
let userColl;

function GroupError() {
}
GroupError.prototype = Object.create(Error.prototype);

function RequestError() {
}
GroupError.prototype = Object.create(Error.prototype);

mongoClient.connect(config.database.baseURL).then((db) => {
    console.log('group service connected');
    groupColl = db.collection('groups');
    requestColl = db.collection('requests');
    userColl = db.collection('user');
}).catch((err) => {
    console.error('group service fail to connect');
    process.exit(1);
});

exports.getGroup = function (_id) {
    _id = new ObjectID(_id);
    return groupColl.findOne({_id});
};

// TODO
exports.getGroupMembers = function (_id) {
    _id = new ObjectID(_id);
    return groupColl.findOne({_id}).then((group) => {
        return group.members;
    });
};

exports.getAllGroupsWithMember = function (assignment) {
    assignment = ObjectID(assignment);
    return groupColl.find({assignment, members:{$exists: true,$ne: []}}).toArray();
};

exports.findGroup = function (user, assignment) {
    user = ObjectID(user);
    assignment = ObjectID(assignment);
    let groupCursor = groupColl.find({members: {$in: [user]}, assignment});
    return groupCursor.count().then((num) => {
        //assert(num > 1, 'There are '+num+' group associate with '+user.toString()+' assignment '+assignment.toString());
    }).then(() => {
        return groupCursor.next();
    });
};

exports.changeDNS = function (_id, newDNS) {
    _id = new ObjectID(_id);
    return groupColl.updateMany({_id}, {$set: {DNS: newDNS}});
};

exports.getRequest = function (_id) {
    _id = ObjectID(_id);
    return requestColl.findOne({_id});
};

exports.getAllRequest = function (group) {
    group = ObjectID(group);
    return requestColl.find({group}).toArray();
};

exports.addPerson = function (assignment, group, user) {
    assignment = ObjectID(assignment);
    user = ObjectID(user);
    if(group){ // add to an existed group
        group = ObjectID(group);
        // first delete this user from all group of this assignment
        return groupColl.updateMany({members: {$in:[user]}, assignment}, {$pull: {members: user}}).then(()=>{
            // then add this user to this group
            return groupColl.updateMany({_id: ObjectID(group)}, {$push:{members:user}});
        }).then((updateResult)=>{
            if(updateResult.result.nModified === 0){
                throw new UserError('no such group');
            }
            return updateResult;
        });
    }else{ // add to a new group
        return groupColl.updateMany({members: {$in:[user]}, assignment}, {$pull: {members: user}}).then(()=>{
            return groupColl.insertOne({
                assignment,
                members: [user]
            });
        });
    }
};

exports.cancelAllRequest = function (assignment, user) {
    assignment = ObjectID(assignment);
    user = ObjectID(user);
    return requestColl.updateMany({assignment, requester: user}, {$set: {status: "cancelled"}});
};

exports.addPersonToGroup = function (assignment, group, user) {
    assignment = new ObjectID(assignment);
    if (group) {group = new ObjectID(group);}

    return Promise.resolve().then(() => {
          return checkIfGroupExist(group);
      }).then((groupExistCount) => {
          if (groupExistCount !== 1) {throw new UserError('Group does not exist');}
          return checkIfUserAlreadyInGroup(group, user);
      }).then((memberInGroupCount) => {
          if (memberInGroupCount == 1) {throw new UserError('User is already in the group');}
          removeUserFromPrevGroup(user,assignment);
      }).then(() => {
          return cleanupEmptyGroups();
      }).then(() => {
          return ungroupUser(user,assignment);
      }).then(() => {
          if (group)
              return addToExistingGroup(group, user, assignment);
          else
              return createNewGroup(user,assignment);
      });
};

checkIfGroupExist = function (group) {
    if (group)
        return groupColl.find({_id: group}).count();
    else
        return 1;
}

checkIfUserAlreadyInGroup = function (group, user) {
    return groupColl.find({_id: group,members:user}).count();
}

removeUserFromPrevGroup = function (user, assignment) {
    return groupColl.findOneAndUpdate({members: {$in: [user]}, assignment}, {$pull: {members: user}}, {returnOriginal:false}).then((groupRes) => {
        if (groupRes.value) {
          //if group only has one member left, set that member as ungrouped
          let members = groupRes.value.members;
          if (members.length == 1)
              return userColl.updateOne({netID: members[0]}, {$pull: {groups: assignment}});
        }
    });
}

cleanupEmptyGroups = function () {
    return groupColl.deleteMany({'members.0': {$exists: false}});
}

ungroupUser = function (user, assignment) {
    return userColl.updateOne({netID: user}, {$pull: {groups: assignment}});
}

addToExistingGroup = function (group, user, assignment) {
    return groupColl.updateMany({_id: group}, {$push: {members: user}}).then((updateResult) => {
        if (updateResult.result.nModified === 0) {throw new GroupError('no such group');}
        //make sure all of the group members are set as grouped for the given assignemnt
        return groupColl.findOne({_id: group}).then((groupResult) => {
            return userColl.updateMany({netID: {$in: groupResult.members}}, {$addToSet: {groups: assignment}});
        });
    }).then(() => {
        return group;
    });
}

createNewGroup = function (user,assignment) {
    return groupColl.insertOne({assignment, members: [user]}).then((result) => {
        return result.insertedId;
    });
}

exports.addRequest = function (group, user, assignment) {
    group = ObjectID(group);
    user = ObjectID(user);
    return Promise.resolve().then(() => {
        return groupColl.find({_id: group}).count();
    }).then((groupExistCount) => {
        if (groupExistCount !== 1) throw new UserError('Invalid group id');
        return requestColl.insertOne({
            group,
            assignment,
            requester: user,
            expiresAt: (new Date()).getTime() + 1000 * 3600 * 48, // expires in 24 hours TODO: add expire index
            status: 'pending'
        });
    }).then((insertedResult) => {
        return insertedResult.insertedId;
    });
};

exports.respondRequest = function (_id, accepted) {
    _id = ObjectID(_id);
    let request;
    let group;
    return Promise.resolve().then(() => {
      return requestColl.findOne({_id}).then((requestResult) => {
          request = requestResult;
          if (request === null) {throw new UserError('This request no longer exist.');}
          if (request.expiresAt < (new Date()).getTime()) {throw new UserError('This request has already expired.');}
      });
    }).then(() => {
      return service.group.getGroup(request.group);
    }).then((groupResult) => {
          group = groupResult;
          if (group)
              request.assignment = group.assignment;
          else
              throw new UserError('Group no longer exist');

          return userColl.find({netID:request.requester,groups:ObjectID(request.assignment)}).count();
      }).then((userGroupedCount) => {
          console.log(userGroupedCount);
          if (userGroupedCount > 0) {
              throw new UserError('Requester is already in a group');
          } else if (request.status === 'accepted') {
              throw new UserError('This request has been accepted by someone in this group');
          } else if (request.status === 'rejected') {
              throw new UserError('This request has been rejected by someone in this group');
          }
          return requestColl.updateOne({_id}, {$set: {status: accepted ? 'accepted' : 'rejected'}}).then((updateResult) => {
              if (updateResult.result.nModified === 0)
                  throw new UserError('Request could not be updated.');
              else
                  return request;
          });
      });
};
