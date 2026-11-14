import React from 'react'
import { useApp } from '../context/AppContext'

export function AboutPage() {
  const { profile, cloud } = useApp()
  const signedIn = Boolean(cloud.account) && cloud.status !== 'signed-out'
  const whose = profile.name ? `${profile.name}'s planner` : 'This planner'

  return (
    <div className="page about">
      <div className="eyebrow">ABOUT</div>
      <h1 className="about-line">
        Life on a software.<br />
        <span>Devs with Claude Code</span>
      </h1>

      <div className="about-rest">
        {signedIn ? (
          <p>
            {whose} is kept in your Google account. The plan, the birthdays, the
            contacts, the month and year plans are stored with Google Firebase and
            kept the same on every device you sign in on, and this browser holds a
            copy so it works offline. Only your account can read it.
          </p>
        ) : (
          <p>
            {whose} keeps everything on this machine. The plan, the birthdays, the
            contacts, the month and year plans — all of it is your browser&rsquo;s own
            storage, and none of it is sent anywhere unless you sign in with Google.
          </p>
        )}
        <p className="about-fine">
          {signedIn
            ? 'The weather goes out only once you have named a town. Signing out clears this browser’s copy; your account keeps everything.'
            : 'The weather goes out only once you have named a town. Clearing the site’s data clears the planner with it.'}
        </p>
      </div>
    </div>
  )
}
