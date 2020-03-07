node("build") {
  try {
    withCredentials([
        usernamePassword(credentialsId: 'builder', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_PASSWORD'),
        file(credentialsId: 'npmrc', variable: 'NPM_CONFIG_USERCONFIG')
    ])
    {
      stage('Clone Repository') {
        checkout scm
      }
      stage('Check Version') {
        sh '.build/01-version.sh'
        def version = readFile "${env.WORKSPACE}/.version.tmp"
        currentBuild.displayName = version
      }
      if (fileExists('.build/02-build.sh')) {
        stage('Build') {
          sh '.build/02-build.sh'
        }
      }
      if (fileExists('.build/03-test.sh')) {
        stage('Test') {
          sh '.build/03-test.sh'
        }
      }
      if (fileExists('.build/04-commit.sh')) {
        stage('Commit' ) {
          sh '.build/04-commit.sh'
        }
      }
      if (fileExists('.build/05-npm-publish.sh')) {
        stage('Publish to NPM') {
          sh '.build/05-npm-publish.sh'
        }
      }
      if (fileExists('.build/06-docker-build.sh')) {
        stage('Build for Docker') {
          sh '.build/06-docker-build.sh'
        }
      }
      if (fileExists('.build/07-docker-publish.sh')) {
        stage('Publish to Docker') {
          sh '.build/07-docker-publish.sh'
        }
      }
    }
  }
  catch(e) {
    echo 'failed'
    throw e
  }
  finally {
    def currentResult = currentBuild.result ?: 'SUCCESS'
    if (currentResult == 'UNSTABLE') {
      echo 'Build is unstable!'
    }
    def previousResult = currentBuild.previousBuild?.result
    if (previousResult != null && previousResult != currentResult) {
      echo 'State of the Pipeline has changed!'
    }
    echo 'Deleting directory...'
    deleteDir()
 }
}
