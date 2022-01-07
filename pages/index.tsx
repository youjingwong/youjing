import type { NextPage } from "next";

const Home: NextPage = () => {
  return (
    <div className="container py-20">
      <h1 className="text-2xl font-bold ">You Jing</h1>

      <p className="mt-5">
        I'm a full stack developer in Malaysia and building systems and
        platforms. Started off scripting games with{" "}
        <a
          href="https://www.autoitscript.com/site/"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          AutoIt
        </a>{" "}
        in 2012. Since then I've worked with Ruby on Rails, Next.js, native iOS
        apps with Swift, Cordova apps, and other technologies.
      </p>
      <hr className="mt-3"></hr>
      <h2 className="text-xl mt-4 font-semibold">Community work</h2>
      <div>
        <ul className="list-disc">
          <li>
            <a
              href="https://www.facebook.com/groups/makan.malaysia/"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Pulang Mengundi
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Home;
