import React from 'react'
import { useApp } from '../context/AppContext'

export function AboutPage() {
  const { profile } = useApp()

  return (
    <div className="page about">
      <div className="eyebrow">ABOUT</div>
      <h1 className="about-line">
        Life on a software.<br />
        <span>Devs with Claude Code</span>
      </h1>

      <div className="about-rest">
        <p>
          {profile.name
            ? `${profile.name}'s planner keeps everything on this machine.`
            : 'This planner keeps everything on this machine.'}{' '}
          The plan, the birthdays, the contacts, the month and year plans — all of it
          is your browser&rsquo;s own storage, and none of it is sent anywhere.
        </p>
        <p className="about-fine">
          The two exceptions wait to be asked: the weather, once you have named a town,
          and the verse of the day, once you have added a YouVersion key. Clearing the
          site&rsquo;s data clears the planner with it.
        </p>
      </div>
    </div>
  )
}
