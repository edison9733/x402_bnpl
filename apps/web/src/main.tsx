import { Component, StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoDeck } from './deck/demo';
import { PitchDeck } from './deck/pitch';
import { UpdateDeck } from './deck/update';
import { RouterProvider, useMatch, usePath } from './lib/router';
import { AgentProfile, Agents } from './pages/Agents';
import { Approve } from './pages/Approve';
import { Formula } from './pages/Formula';
import { Landing } from './pages/Landing';
import { Market } from './pages/Market';
import { Network } from './pages/Network';
import { Review } from './pages/Review';
import './styles.css';

/** The home page's tab title, as index.html sets it. */
const HOME_TITLE = 'Tessera · Buy now, pay later for AI agents';

/** Names the browser tab after the page: "Market · Tessera". With no name, the home page's title. */
function Titled({ name, children }: { name?: string; children: ReactNode }) {
  useEffect(() => {
    document.title = name ? `${name} · Tessera` : HOME_TITLE;
  }, [name]);
  return children;
}

function Routes() {
  const path = usePath();
  const profile = useMatch('/agents/:wallet');
  const review = useMatch('/review/:order');
  const approve = useMatch('/approve/:order');
  if (path.startsWith('/deck/pitch')) return <Titled name="Pitch deck"><PitchDeck /></Titled>;
  if (path.startsWith('/deck/demo')) return <Titled name="Technical demo"><DemoDeck /></Titled>;
  if (path.startsWith('/deck/update')) return <Titled name="What changed"><UpdateDeck /></Titled>;
  if (profile) return <Titled name="Credit file"><AgentProfile wallet={profile.wallet!} /></Titled>;
  if (approve) return <Titled name="Approve a purchase"><Approve order={approve.order!} /></Titled>;
  if (path.startsWith('/network')) return <Titled name="Live network"><Network /></Titled>;
  if (path.startsWith('/agents')) return <Titled name="Agents"><Agents /></Titled>;
  if (path.startsWith('/market')) return <Titled name="Market"><Market /></Titled>;
  if (path.startsWith('/formula')) return <Titled name="The score"><Formula /></Titled>;
  if (path.startsWith('/review')) return <Titled name="Review"><Review order={review?.order} /></Titled>;
  return <Titled><Landing /></Titled>;
}

/** One bad value from the chain or a pasted link shows a way back, not a blank page. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <h1 className="display text-[2.4rem]">Something went wrong on this page.</h1>
          <p className="mt-3">
            <a
              className="link"
              href="#/"
              onClick={() => {
                this.setState({ failed: false });
              }}
            >
              Back to the home page
            </a>
          </p>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider>
      <Boundary>
        <Routes />
      </Boundary>
    </RouterProvider>
  </StrictMode>,
);
