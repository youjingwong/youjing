import type { NextPage } from "next";
import Link from "next/link";
import { workSummaries } from "../src/data/work_summaries";

const Home: NextPage = () => {
  return (
    <div className="container py-20">
      <h1>You Jing</h1>

      <p className="mt-5">
        I&apos;m a full stack developer in Malaysia and building systems and
        platforms. Previously mentored hundreds of bootcamp students, and also
        contracted for startups and enterprises, small and large.
      </p>
      <p>
        Started off scripting games with{" "}
        <a
          href="https://www.autoitscript.com/site/"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          AutoIt
        </a>{" "}
        in 2012. Learned coding via MOOC courses, a Ruby on Rails bootcamp in
        Malaysia, and an iOS bootcamp in San Francisco. Always curious and
        flexible, I have worked on a variety of domains, including but not
        limited to two sided platforms, meal planning, warehouse management
        systems, and call center systems.
      </p>
      <hr className="my-8"></hr>
      <h2 className="mt-4 ">Work</h2>

      {workSummaries.map((workSummary, index) => {
        return (
          <div className="mt-4" key={index}>
            <p className="mt-3">
              <Link href={workSummary.href}>
                <a className="underline">
                  <strong>{workSummary.title}</strong>
                </a>
              </Link>{" "}
              {workSummary.body}
            </p>
          </div>
        );
      })}
      <hr className="my-10"></hr>
      <div>
        <a
          href="https://www.linkedin.com/in/you-jing-wong/"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          LinkedIn
        </a>
        <span className="mx-2">·</span>
        <a
          href="https://github.com/youjingwong/"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Github
        </a>
        <span className="mx-2">·</span>
        <a
          href="https://twitter.com/youjingwong"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Twitter
        </a>
      </div>
    </div>
  );
};

export default Home;
