# SDC Interim Agents Deployer

## Usage

```
./bin/deploy_agents \
    [-j <concurrency>] \
    [-n <server> [ -n <server> ... ]] \
    <agentshar_name>

    The "-j" flag allows the number of concurrent agent shar downloads
    to be specified.  Defaults to 1.

    By default, all active setup servers that CNAPI knows about are a
    target for upgrade.  If specific servers are desired, use the "-n"
    flag.

    The agent shar name is either the name of a file in "/usbkey/extra/agents"
    on the headnode, or the value "latest"; this value resolves the "latest"
    symlink in that directory.
```

## Example Output

### Success

```
[root@headnode (staging-1) ~]# /var/tmp/DEPLOY_AGENTS/bin/deploy_agents -j 1 latest
Work Directory will be: /var/tmp/DEPLOY_AGENTS.2015-07-17T23:39:42.949Z
 ## starting ur discovery...
 ## ur discovery ok!


 ## TASK: Create Download/Work Directory

   -- running on "RA10134" (1 of 4)
   -- running on "RA14872" (2 of 4)
   -- running on "headnode" (3 of 4)
   -- running on "RA10146" (4 of 4)
   -- success on "RA14872"
   -- success on "RA10134"
   -- success on "headnode"
   -- success on "RA10146"

 ## TASK: Download Agent To CN

   -- running on "RA10134" (1 of 4)
   -- success on "RA10134"
   -- running on "RA14872" (2 of 4)
   -- success on "RA14872"
   -- running on "headnode" (3 of 4)
   -- success on "headnode"
   -- running on "RA10146" (4 of 4)
   -- success on "RA10146"

 ## TASK: Install Agents on CN

   -- running on "RA10134" (1 of 4)
   -- running on "RA14872" (2 of 4)
   -- running on "headnode" (3 of 4)
   -- running on "RA10146" (4 of 4)
   -- success on "headnode"
   -- success on "RA14872"
   -- success on "RA10134"
   -- success on "RA10146"
OK, done.
```

### Failure

```
[root@headnode (staging-1) ~]# /var/tmp/DEPLOY_AGENTS/bin/deploy_agents -j 2 latest
Work Directory will be: /var/tmp/DEPLOY_AGENTS.2015-07-17T23:13:18.612Z
 ## starting ur discovery...
 ## ur discovery ok!


 ## TASK: Create Download/Work Directory

   -- running on "headnode" (1 of 4)
   -- running on "RA10134" (2 of 4)
   -- running on "RA10146" (3 of 4)
   -- running on "RA14872" (4 of 4)
   -- success on "RA10146"
   -- success on "headnode"
   -- success on "RA10134"
   -- success on "RA14872"

 ## TASK: Download Agent To CN

   -- running on "headnode" (1 of 4)
   -- running on "RA10134" (2 of 4)
   -- success on "headnode"
   -- running on "RA10146" (3 of 4)
   -- success on "RA10134"
   -- running on "RA14872" (4 of 4)
   -- success on "RA10146"
   -- success on "RA14872"

 ## TASK: Install Agents on CN

   -- running on "headnode" (1 of 4)
   -- running on "RA10134" (2 of 4)
   -- running on "RA10146" (3 of 4)
   -- running on "RA14872" (4 of 4)
   -- ERROR: command exited 1 on "headnode"
        stderr:
   -- ERROR: command exited 1 on "RA10146"
        stderr:
   -- ERROR: command exited 1 on "RA14872"
        stderr:
   -- ERROR: command exited 1 on "RA10134"
        stderr:
ERROR: VError: these hosts failed, causing an abort: headnode, RA10146, RA14872, RA10134
    at RunQueue.<anonymous> (/var/tmp/DEPLOY_AGENTS/cmd/deploy_agents.js:316:9)
    at RunQueue.emit (events.js:92:17)
    at RunQueue._finish (/var/tmp/DEPLOY_AGENTS/node_modules/urclient/lib/runqueue.js:215:7)
    at RunQueue._dispatch (/var/tmp/DEPLOY_AGENTS/node_modules/urclient/lib/runqueue.js:274:9)
    at processImmediate [as _immediateCallback] (timers.js:363:15)
```
