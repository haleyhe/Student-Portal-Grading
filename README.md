# Grading

This is the grading API that I wrote for the student grading portal. I collaborated with the other students to create a MongoDB collection schema that stores the group information. 

**NOTE:** This repo does not contain the full code of student grading portal. It only contains the portions that I have contributed to. 

When the admin creates a new assignment, it has a boolean field called groupable. 
- If the assignment has groupable set to false, this feature is not used.
- If the assignment has groupable set to true, the backend will automatically create a group for each student in the class. This automatic groups is created so students who prefer to work solo will not experience any overhead and can just submit their assignment as usual.

If a solo student wants to join any individual or any group, all they need to do is send a request.

If a grouped student want to go solo or join another group, they will first have to click a leave group button.

### Scenarios to show how the grouping works
1. If two solo students want to get together, student A just sends a request to student B. After B accepts A, place both into B’s group and delete A’s group (has no members now)
   - Course of API action: A send-request, B respond-request

2. If a solo student wants to join a 2+ people group, the solo student would just request to join the group
   - Course of API actions: solo send-request, anyone in group respond-request

3. If student wants to leave a group (2+ people) and go solo, the student will click on a leave group button
   - Course of API actions: student new-group

4. If student wants to leave a group (2+) and join another group (2+), student will have to click the leave group button and send a request to join another group
   - Course of API actions: student new-group, student send-request, anyone in new group accept-requests. 
