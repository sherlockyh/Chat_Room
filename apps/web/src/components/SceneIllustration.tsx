import conversation from '../assets/conversation-scene.svg';
import friends from '../assets/friends-scene.svg';
import keepsake from '../assets/keepsake-scene.svg';

const scenes = { conversation, friends, keepsake };

export default function SceneIllustration({
  kind,
  className = '',
}: {
  kind: keyof typeof scenes;
  className?: string;
}) {
  return (
    <img
      className={`scene-illustration ${className}`}
      src={scenes[kind]}
      alt=""
      aria-hidden="true"
      width={kind === 'conversation' ? 400 : 200}
      height={kind === 'conversation' ? 260 : 140}
      draggable={false}
    />
  );
}
