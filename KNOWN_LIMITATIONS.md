# Known limitations

A web push notification is not a guaranteed alarm clock.

* The OS/browser decide sound, vibration, silent mode, Do Not Disturb and battery optimisation. Ringly cannot override them.
* Timing is "about the minute": the worker runs every minute and push services may delay delivery.
* iPhone/iPad only receive Web Push when the site is installed to the Home Screen (iOS 16.4+).
* The loud in-app alarm only plays while the app is open and after the user has tapped to enable sound.
* "Delivered" means the push service accepted the message, not that a person saw or heard it. Acknowledgement is not attendance.
* Native apps are needed for stronger alarm behaviour (exact alarms on Android, Critical Alerts on iOS with Apple approval).
