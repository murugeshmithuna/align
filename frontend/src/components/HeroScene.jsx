import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// A slowly drifting particle field behind the landing page hero.
export default function HeroScene() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.z = 6

    const particleCount = 260
    const positions = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0xff7a4d,
      size: 0.045,
      transparent: true,
      opacity: 0.55,
    })

    const points = new THREE.Points(geometry, material)
    scene.add(points)
    scene.add(new THREE.AmbientLight(0x1c6e59, 1))

    let frameId
    const clock = new THREE.Clock()

    function animate() {
      const elapsed = clock.getElapsedTime()
      points.rotation.y = elapsed * 0.03
      points.rotation.x = Math.sin(elapsed * 0.05) * 0.1
      renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    animate()

    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10 h-full w-full" />
}
